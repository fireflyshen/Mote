import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("build", { recursive: true });
await build({
  entryPoints: ["src/main.ts"],
  outfile: "build/main.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["electron"],
});
await build({
  entryPoints: ["src/preload.ts"],
  outfile: "build/preload.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["electron"],
});
await build({
  entryPoints: ["src/renderer.ts"],
  outfile: "build/renderer.js",
  bundle: true,
  platform: "browser",
  target: "chrome130",
  format: "iife",
});
await Promise.all([
  copyFile("src/index.html", "build/index.html"),
  copyFile("src/style.css", "build/style.css"),
]);
