import { cp, mkdir, rename, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const extension = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await stat(
    join(
        extension,
        "dist/assets/floating-notes",
        `${process.platform}-${process.arch}`,
    ),
);
const base = join(homedir(), "Library/Application Support/com.tinycast.app");
await stat(base);
const target = join(base, "extensions/mote"),
    backup = join(
        base,
        "extension-support/mote/plugin-backups",
        String(Date.now()),
    );
try {
    await stat(target);
    await mkdir(dirname(backup), { recursive: true, mode: 0o700 });
    await rename(target, backup);
} catch (error) {
    if (error.code !== "ENOENT") throw error;
}
await cp(join(extension, "dist"), target, {
    recursive: true,
    verbatimSymlinks: true,
});
console.log(
    "Installed Mote plugin with its bundled floating window; preferences and drafts preserved",
);
