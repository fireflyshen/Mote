import { join } from "node:path";
export function windowPath(assetsPath: string, platform: NodeJS.Platform, arch: string) {
  if (!["darwin", "win32"].includes(platform) || !["arm64", "x64"].includes(arch))
    throw new Error("当前平台尚未提供记事本窗口");
  return join(
    assetsPath,
    "floating-notes",
    `${platform}-${arch}`,
    platform === "darwin" ? "Mote Notes.app" : "Mote Notes.exe",
  );
}
export function windowArguments(configurationFile: string, dataDirectory: string) {
  return ["--raycast", "--config", configurationFile, "--data-dir", dataDirectory];
}
