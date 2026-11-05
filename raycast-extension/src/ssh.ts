import { spawn } from "node:child_process";
export function sshTarget(value: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.@-]{0,199}$/.test(value))
    throw new Error("SSH Host 只能是已有的 SSH 主机名，例如 rn");
  return value;
}
export async function sendSshMemo(
  host: string,
  token: string,
  pending: { id: string; content: string },
) {
  const target = sshTarget(host);
  return await new Promise<{ id: string; content: string }>((resolve, reject) => {
    const child = spawn(
      "/usr/bin/ssh",
      [
        "-T",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        target,
        "docker exec -i mote node /app/scripts/capture.js",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "",
      done = false;
    const finish = (error?: Error, value?: { id: string; content: string }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value!);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("连接超时，草稿已保留。请检查 ssh rn 后重试。"));
    }, 25_000);
    child.on("error", () => finish(new Error("无法启动 SSH，请检查本机 SSH 配置")));
    child.stdin.on("error", () => finish(new Error("SSH 连接中断，草稿已保留")));
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 512 * 1024) {
        child.kill();
        finish(new Error("服务器响应异常"));
      }
    });
    // Drain stderr without exposing server or SSH diagnostic details in memo content.
    child.stderr.resume();
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error("无法连接 RN，请确认 ssh rn 可用且 Mote 服务已启动"));
        return;
      }
      try {
        const response = JSON.parse(output) as {
          status: number;
          body: { id: string; content: string; error?: string };
        };
        if (response.status !== 201) throw new Error(response.body.error || "发送失败");
        if (response.body.id !== pending.id || response.body.content !== pending.content)
          throw new Error("保存未确认，请保留草稿并重试");
        finish(undefined, response.body);
      } catch (error) {
        finish(error instanceof Error ? error : new Error("保存未确认"));
      }
    });
    child.stdin.end(JSON.stringify({ ...pending, token: token.trim() }));
  });
}
