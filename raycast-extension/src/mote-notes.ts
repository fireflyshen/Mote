import { closeMainWindow, environment, getPreferenceValues, showToast, Toast } from "@raycast/api";
import { execFile } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
interface NotesPreferences {
  transport: string;
  sshTarget?: string;
  serverUrl: string;
  captureToken: string;
}
export default async function Command() {
  try {
    const preferences = getPreferenceValues<NotesPreferences>();
    await mkdir(environment.supportPath, { recursive: true, mode: 0o700 });
    const config = join(environment.supportPath, "notes-config.json");
    await writeFile(config, JSON.stringify(preferences), { mode: 0o600 });
    await chmod(config, 0o600);
    await closeMainWindow({ clearRootSearch: true });
    await promisify(execFile)("/usr/bin/open", [
      "-a",
      join(homedir(), "Library/Application Support/Mote/Mote Notes.app"),
      "--args",
      config,
    ]);
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "无法打开 Mote Notes",
      message: error instanceof Error ? error.message : "请重新安装记事本窗口",
    });
  }
}
