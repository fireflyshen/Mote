import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { windowPath, windowArguments } from "../src/launch.ts";
test("both platforms launch the window bundled inside extension assets", () => {
  assert.equal(
    windowPath("/extension/assets", "darwin", "arm64"),
    join("/extension/assets", "floating-notes/darwin-arm64/Mote Notes.app"),
  );
  assert.equal(
    windowPath("/extension/assets", "win32", "x64"),
    join("/extension/assets", "floating-notes/win32-x64/Mote Notes.exe"),
  );
  assert.throws(() => windowPath("/extension/assets", "linux", "x64"));
});
test("launch arguments pass only private file paths, not tokens or memo content", () => {
  assert.deepEqual(windowArguments("/private/config.json", "/private/notebook"), [
    "--raycast",
    "--config",
    "/private/config.json",
    "--data-dir",
    "/private/notebook",
  ]);
});
