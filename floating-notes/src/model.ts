import { randomUUID } from "node:crypto";
export interface Note {
  id: string;
  content: string;
  syncedContent: string;
  version?: number;
  conflict: boolean;
  connectionID?: string;
}
export interface Notebook {
  notes: Note[];
  activeID: string;
}
export interface Configuration {
  transport: "ssh" | "https";
  sshTarget: string;
  serverUrl: string;
  captureToken: string;
}
export interface RemoteMemo {
  id: string;
  content: string;
  version: number;
}
export const defaultConfig = (): Configuration => ({
  transport: "ssh",
  sshTarget: "rn",
  serverUrl: "https://mote.caten.top",
  captureToken: "",
});
export const newNote = (): Note => ({
  id: randomUUID(),
  content: "",
  syncedContent: "",
  conflict: false,
});
export function newNotebook(): Notebook {
  const note = newNote();
  return { notes: [note], activeID: note.id };
}
export const pending = (note: Note) => !!note.content.trim() && note.content !== note.syncedContent;
export const connectionID = (config: Configuration) =>
  config.transport === "ssh"
    ? `ssh:${config.sshTarget}`
    : `https:${new URL(config.serverUrl).origin}`;
export function parseNotebook(input: unknown): Notebook {
  if (!input || typeof input !== "object") throw new Error("记事本格式无效，原文件已保留");
  const data = input as Record<string, unknown>;
  if (!Array.isArray(data.notes) || !data.notes.length)
    throw new Error("记事本没有有效记录，原文件已保留");
  const seen = new Set<string>();
  const notes = data.notes.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("记录格式无效");
    const n = value as Record<string, unknown>;
    if (
      typeof n.id !== "string" ||
      !/^[a-f\d-]{36}$/i.test(n.id) ||
      seen.has(n.id) ||
      typeof n.content !== "string" ||
      typeof n.syncedContent !== "string" ||
      (n.version !== undefined && (!Number.isSafeInteger(n.version) || (n.version as number) < 1))
    )
      throw new Error("记录格式无效，原文件已保留");
    seen.add(n.id);
    return {
      id: n.id,
      content: n.content,
      syncedContent: n.syncedContent,
      version: n.version as number | undefined,
      conflict: n.conflict === true,
      ...(typeof n.connectionID === "string" ? { connectionID: n.connectionID } : {}),
    };
  });
  return {
    notes,
    activeID:
      typeof data.activeID === "string" && seen.has(data.activeID) ? data.activeID : notes[0].id,
  };
}
export function validateConfig(input: unknown, previous = defaultConfig()): Configuration {
  if (!input || typeof input !== "object") throw new Error("连接设置无效");
  const item = input as Record<string, unknown>;
  const transport = item.transport ?? previous.transport;
  if (transport !== "ssh" && transport !== "https") throw new Error("连接方式无效");
  const sshTarget = typeof item.sshTarget === "string" ? item.sshTarget.trim() : previous.sshTarget;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.@-]{0,199}$/.test(sshTarget))
    throw new Error("SSH 主机名无效，例如填写 rn");
  const serverUrl = typeof item.serverUrl === "string" ? item.serverUrl.trim() : previous.serverUrl;
  const url = new URL(serverUrl);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  )
    throw new Error("请填写 HTTPS 首页地址");
  const captureToken =
    typeof item.captureToken === "string" && item.captureToken.trim()
      ? item.captureToken.trim()
      : previous.captureToken;
  if (captureToken && !/^[a-zA-Z0-9_-]{16,256}$/.test(captureToken))
    throw new Error("速记令牌格式无效");
  return { transport, sshTarget, serverUrl: url.origin, captureToken };
}
