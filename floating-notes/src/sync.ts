import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { win32 } from "node:path";
import type { Configuration, Note, RemoteMemo } from "./model.ts";
export class SyncError extends Error {
  readonly conflict: boolean;
  constructor(message: string, conflict = false) {
    super(message);
    this.conflict = conflict;
  }
}
export function sshExecutable(
  platform: NodeJS.Platform = process.platform,
  systemRoot = process.env.SystemRoot || "C:\\Windows",
  exists = existsSync,
) {
  if (platform !== "win32") return "/usr/bin/ssh";
  const full = win32.join(systemRoot, "System32", "OpenSSH", "ssh.exe");
  return exists(full) ? full : "ssh.exe";
}
function verified(body: unknown, note: Note): RemoteMemo {
  const memo = body as Partial<RemoteMemo> | null;
  if (
    !memo ||
    memo.id !== note.id ||
    memo.content !== note.content.trim() ||
    !Number.isSafeInteger(memo.version) ||
    (memo.version as number) < 1
  )
    throw new SyncError("保存未确认，内容已保存在本机");
  return memo as RemoteMemo;
}
function response(status: number, body: unknown, note: Note) {
  if (status !== 200) {
    const error = body as { error?: string } | null;
    throw new SyncError(
      typeof error?.error === "string" ? error.error : "同步未完成，内容已保存在本机",
      status === 409,
    );
  }
  return verified(body, note);
}
export async function syncNote(
  note: Note,
  config: Configuration,
  request: typeof fetch = fetch,
): Promise<RemoteMemo> {
  if (!config.captureToken) throw new SyncError("请先在设置中填写 Mote 速记令牌");
  const payload = {
    id: note.id,
    content: note.content,
    ...(note.version ? { version: note.version } : {}),
  };
  if (config.transport === "https") {
    const r = await request(new URL("/api/notepad", config.serverUrl), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.captureToken}`,
      },
      body: JSON.stringify(payload),
    });
    if (!r.headers.get("content-type")?.includes("application/json"))
      throw new SyncError("服务器返回了登录页面，请检查连接设置");
    return response(r.status, await r.json(), note);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.@-]{0,199}$/.test(config.sshTarget))
    throw new SyncError("SSH 主机名无效");
  return await new Promise<RemoteMemo>((resolve, reject) => {
    const child = spawn(
      sshExecutable(),
      [
        "-T",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        config.sshTarget,
        "docker exec -i mote node /app/scripts/notepad.js",
      ],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: false },
    );
    let output = "",
      finished = false;
    const end = (error?: Error, memo?: RemoteMemo) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(memo!);
    };
    const timer = setTimeout(() => {
      child.kill();
      end(new SyncError("SSH 连接超时，内容已保存在本机，将自动重试"));
    }, 25_000);
    child.on("error", () =>
      end(
        new SyncError(
          process.platform === "win32"
            ? "无法启动 OpenSSH，请确认 Windows 的 ssh rn 可用"
            : "无法启动 SSH，请确认 ssh rn 可用",
        ),
      ),
    );
    child.stdin.on("error", () => end(new SyncError("SSH 连接中断，内容已保存在本机")));
    child.stderr.resume();
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 1024 * 1024) {
        child.kill();
        end(new SyncError("服务器响应过大"));
      }
    });
    child.on("close", (code) => {
      if (code !== 0) {
        end(new SyncError("连接未完成，内容已保存在本机，将自动重试"));
        return;
      }
      try {
        const result = JSON.parse(output) as { status: number; body: unknown };
        end(undefined, response(result.status, result.body, note));
      } catch (error) {
        end(error instanceof Error ? error : new SyncError("服务器响应异常"));
      }
    });
    child.stdin.end(JSON.stringify({ ...payload, token: config.captureToken }));
  });
}
