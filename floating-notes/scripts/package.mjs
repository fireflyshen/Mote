import { downloadArtifact } from "@electron/get";
import { createPackage } from "@electron/asar";
import extract from "extract-zip";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
const [platform = process.platform, arch = process.arch] = process.argv.slice(2);
if (!["darwin", "win32"].includes(platform) || !["arm64", "x64"].includes(arch))
  throw new Error("Unsupported target");
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const electron = JSON.parse(await readFile("node_modules/electron/package.json", "utf8"));
const destination = resolve("dist", `${platform}-${arch}`),
  staging = resolve("output/package-stage");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await cp("build", join(staging, "build"), { recursive: true });
await cp("assets", join(staging, "assets"), { recursive: true });
await writeFile(
  join(staging, "package.json"),
  JSON.stringify({
    name: pkg.name,
    productName: pkg.productName,
    version: pkg.version,
    main: pkg.main,
    description: pkg.description,
  }),
);
const archive = await downloadArtifact({
  version: electron.version,
  artifactName: "electron",
  platform,
  arch,
});
await extract(archive, { dir: destination });
let resources, bundle;
if (platform === "darwin") {
  bundle = join(destination, "Mote Notes.app");
  await rename(join(destination, "Electron.app"), bundle);
  resources = join(bundle, "Contents/Resources");
  const plist = join(bundle, "Contents/Info.plist");
  execFileSync("/usr/bin/plutil", ["-insert", "LSUIElement", "-bool", "true", plist]);
  for (const [key, value] of Object.entries({
    CFBundleName: "Mote Notes",
    CFBundleDisplayName: "Mote Notes",
    CFBundleIdentifier: "top.caten.mote.raycast-notes",
    CFBundleShortVersionString: pkg.version,
  }))
    execFileSync("/usr/bin/plutil", ["-replace", key, "-string", value, plist]);
} else {
  resources = join(destination, "resources");
  await rename(join(destination, "electron.exe"), join(destination, "Mote Notes.exe"));
}
for (const license of ["LICENSE", "LICENSES.chromium.html"]) {
  await cp(
    join(destination, license),
    join(resources, license === "LICENSE" ? "electron-LICENSE" : license),
  );
}
await rm(join(resources, "default_app.asar"), { force: true });
await createPackage(staging, join(resources, "app.asar"));
if (platform === "darwin")
  execFileSync(
    "/usr/bin/codesign",
    ["--force", "--deep", "--sign", "-", "--preserve-metadata=entitlements", bundle],
    { stdio: "inherit" },
  );
console.log(`Packaged extension window: ${destination}`);
