import {
    closeMainWindow,
    environment,
    getPreferenceValues,
    showToast,
    Toast,
} from "@raycast/api";
import { execFile, spawn } from "node:child_process";
import { chmod, mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { windowArguments, windowPath } from "./launch";
interface Preferences {
    transport: "ssh" | "https";
    sshTarget?: string;
    serverUrl?: string;
    captureToken: string;
}
export default async function Command() {
    try {
        const preferences = getPreferenceValues<Preferences>();
        const helper = windowPath(
            environment.assetsPath,
            process.platform,
            process.arch,
        );
        await stat(helper);
        const dataDirectory = join(environment.supportPath, "notebook");
        await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
        const configurationFile = join(
            environment.supportPath,
            "notes-config.json",
        );
        await writeFile(
            configurationFile,
            JSON.stringify({
                transport: preferences.transport,
                sshTarget: preferences.sshTarget || "rn",
                serverUrl: preferences.serverUrl || "https://mote.caten.top",
                captureToken: preferences.captureToken,
            }),
            { mode: 0o600 },
        );
        await chmod(configurationFile, 0o600);
        const args = windowArguments(configurationFile, dataDirectory);
        await closeMainWindow({ clearRootSearch: true });
        if (process.platform === "darwin")
            await promisify(execFile)("/usr/bin/open", [
                "-a",
                helper,
                "--args",
                ...args,
            ]);
        else
            await new Promise<void>((resolve, reject) => {
                const child = spawn(
                    "cmd.exe",
                    ["/c", "start", '""', helper, ...args],
                    {
                        detached: true,
                        stdio: "ignore",
                        shell: false,
                        windowsHide: true,
                    },
                );
                child.on("error", reject);
                child.on("close", (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`启动记事本失败 (代码: ${code})`));
                });
            });
    } catch (error) {
        await showToast({
            style: Toast.Style.Failure,
            title: "无法打开 Mote 记事本",
            message:
                error instanceof Error
                    ? error.message
                    : "请检查插件设置或重新构建插件",
        });
    }
}
