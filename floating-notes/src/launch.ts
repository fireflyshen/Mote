import { isAbsolute, resolve } from "node:path";
export function launchOptions(
    args: string[],
): { configurationFile: string; dataDirectory: string } | null {
    if (!args.includes("--raycast")) return null;
    const read = (flag: string) => {
        const index = args.indexOf(flag);
        return index >= 0 ? args[index + 1] : undefined;
    };
    const configurationFile = read("--config"),
        dataDirectory = read("--data-dir");
    if (
        !configurationFile ||
        !dataDirectory ||
        !isAbsolute(configurationFile) ||
        !isAbsolute(dataDirectory)
    )
        return null;
    return {
        configurationFile: resolve(configurationFile),
        dataDirectory: resolve(dataDirectory),
    };
}
