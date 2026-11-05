import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const extension = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
    helper = resolve(extension, "../floating-notes");
const [platform = process.platform, arch = process.arch] =
    process.argv.slice(2);
function run(command, args, cwd) {
    const result = spawnSync(command, args, {
        cwd,
        stdio: "inherit",
        shell: false,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Build failed: ${command}`);
}
const npm = process.platform === "win32" ? process.execPath : "npm";
const npmArgs = process.platform === "win32" ? [process.env.npm_execpath] : [];
run(npm, [...npmArgs, "run", "build"], helper);
run(process.execPath, ["scripts/package.mjs", platform, arch], helper);
const generated = join(extension, "assets/floating-notes");
await rm(generated, { recursive: true, force: true });
await mkdir(generated, { recursive: true });
await cp(
    join(helper, "dist", `${platform}-${arch}`),
    join(generated, `${platform}-${arch}`),
    {
        recursive: true,
        verbatimSymlinks: true,
    },
);
const require = createRequire(join(extension, "package.json"));
const manifest = require("@raycast/api/package.json"),
    cli = resolve(
        dirname(require.resolve("@raycast/api/package.json")),
        typeof manifest.bin === "string" ? manifest.bin : manifest.bin.ray,
    );
run(process.execPath, [cli, "build", "-e", "dist", "-o", "dist"], extension);
await rm(join(extension, "dist/assets/floating-notes"), {
    recursive: true,
    force: true,
});
await cp(generated, join(extension, "dist/assets/floating-notes"), {
    recursive: true,
    verbatimSymlinks: true,
});
const { ZipArchive } = await import(
    pathToFileURL(join(helper, "node_modules/archiver/index.js")).href
);
const outputDirectory = resolve(extension, "../output");
await mkdir(outputDirectory, { recursive: true });
const exportDirectory = join(
    outputDirectory,
    `raycast-export-${platform}-${arch}`,
);
await rm(exportDirectory, { recursive: true, force: true });
await cp(join(extension, "dist"), exportDirectory, {
    recursive: true,
    verbatimSymlinks: true,
});
for (const item of [
    "src",
    "tsconfig.json",
    "package-lock.json",
    "eslint.config.js",
    "README.md",
]) {
    await cp(join(extension, item), join(exportDirectory, item), {
        recursive: true,
    });
}
const exportManifest = JSON.parse(
    await readFile(join(extension, "package.json"), "utf8"),
);
exportManifest.scripts = {
    dev: "ray develop",
    build: "ray build -e dist -o dist",
    typecheck: "tsc --noEmit",
};
await writeFile(
    join(exportDirectory, "package.json"),
    JSON.stringify(exportManifest, null, 2),
);
const file = join(outputDirectory, `Mote-raycast-${platform}-${arch}.zip`);
await new Promise((resolve, reject) => {
    const stream = createWriteStream(file),
        zip = new ZipArchive({ zlib: { level: 6 } });
    stream.on("close", resolve);
    zip.on("error", reject);
    zip.pipe(stream);
    zip.directory(exportDirectory, "Mote");
    void zip.finalize();
});
console.log(`Raycast extension bundle: ${file}`);
