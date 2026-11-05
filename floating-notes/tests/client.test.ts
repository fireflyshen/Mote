import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Controller } from "../src/controller.ts";
import { defaultConfig, newNotebook, parseNotebook, validateConfig } from "../src/model.ts";
import { Storage } from "../src/storage.ts";
import { sshExecutable, syncNote, SyncError } from "../src/sync.ts";
const config = () => ({ ...defaultConfig(), captureToken: "valid-test-token-123456" });
test("legacy notebook migration preserves IDs, revision, drafts and original file", () => {
  const dir = mkdtempSync(join(tmpdir(), "mote-notes-")),
    legacy = join(dir, "old.json"),
    book = newNotebook();
  book.notes[0].content = "旧草稿";
  book.notes[0].version = 3;
  writeFileSync(legacy, JSON.stringify(book));
  const store = new Storage(join(dir, "new"));
  const imported = store.loadNotebook(legacy);
  assert.deepEqual(imported, parseNotebook(book));
  assert.equal(readFileSync(legacy, "utf8"), JSON.stringify(book));
  assert.ok(existsSync(join(dir, "new/migration-backups/notebook-original.json")));
  if (process.platform !== "win32") assert.equal(statSync(store.notebookFile).mode & 0o777, 0o600);
  imported.notes[0].content = "新草稿";
  store.saveNotebook(imported);
  assert.equal(store.loadNotebook(legacy).notes[0].content, "新草稿");
});
test("corrupt existing notebook is never replaced by an empty file or legacy copy", () => {
  const dir = mkdtempSync(join(tmpdir(), "mote-notes-")),
    store = new Storage(dir);
  writeFileSync(store.notebookFile, "broken");
  assert.throws(() => store.loadNotebook());
  assert.equal(readFileSync(store.notebookFile, "utf8"), "broken");
});
test("local drafts survive failed sync and a restart", async () => {
  const store = new Storage(mkdtempSync(join(tmpdir(), "mote-notes-")));
  const c = new Controller(
    newNotebook(),
    config(),
    store,
    () => {},
    async () => {
      throw new Error("offline");
    },
  );
  c.update("离线草稿");
  await c.sync();
  assert.equal(c.snapshot().level, "error");
  c.dispose();
  assert.equal(store.loadNotebook().notes[0].content, "离线草稿");
  assert.equal(store.loadNotebook().notes[0].version, undefined);
});
test("acknowledgements keep edits typed while a save was in flight and continue at new version", async () => {
  const store = new Storage(mkdtempSync(join(tmpdir(), "mote-notes-")));
  let release: ((memo: { id: string; content: string; version: number }) => void) | undefined;
  const submitted: { content: string; version?: number }[] = [];
  const c = new Controller(
    newNotebook(),
    config(),
    store,
    () => {},
    async (note) => {
      submitted.push(note);
      if (submitted.length === 1)
        return await new Promise((resolve) => {
          release = resolve;
        });
      return { id: note.id, content: note.content, version: 2 };
    },
  );
  c.update("first");
  const saving = c.sync();
  c.update("second");
  release!({ id: c.active.id, content: "first", version: 1 });
  await saving;
  assert.equal(c.active.content, "second");
  assert.equal(c.active.version, 2);
  assert.equal(submitted[1].version, 1);
  assert.equal(c.notebook.notes.length, 1);
  c.dispose();
});
test("remote conflicts persist across restarts and can be saved as a new record", async () => {
  const store = new Storage(mkdtempSync(join(tmpdir(), "mote-notes-")));
  let count = 0;
  const c = new Controller(
    newNotebook(),
    config(),
    store,
    () => {},
    async (note) => {
      count++;
      if (count === 1) throw new SyncError("remote changed", true);
      return { id: note.id, content: note.content, version: 1 };
    },
  );
  c.update("preserve me");
  await c.sync();
  const oldID = c.active.id;
  assert.equal(store.loadNotebook().notes[0].conflict, true);
  c.duplicate();
  await new Promise((resolve) => setImmediate(resolve));
  assert.notEqual(c.active.id, oldID);
  assert.equal(c.active.content, "preserve me");
  assert.equal(c.notebook.notes.find((n) => n.id === oldID)!.content, "preserve me");
  c.dispose();
});
test("Windows selects OpenSSH without a shell and falls back to PATH", () => {
  assert.equal(
    sshExecutable("win32", "C:\\Windows", () => true),
    "C:\\Windows\\System32\\OpenSSH\\ssh.exe",
  );
  assert.equal(
    sshExecutable("win32", "C:\\Windows", () => false),
    "ssh.exe",
  );
  assert.equal(sshExecutable("darwin"), "/usr/bin/ssh");
});
test("connection settings reject shell syntax and insecure token destinations", () => {
  for (const host of ["-oProxyCommand=bad", "rn;whoami", "rn\nwhoami", "$(whoami)"])
    assert.throws(() => validateConfig({ ...config(), sshTarget: host }));
  for (const serverUrl of [
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com/path",
    "https://example.com/?token=x",
  ])
    assert.throws(() => validateConfig({ ...config(), serverUrl }));
  assert.equal(
    validateConfig({ ...config(), captureToken: "" }, config()).captureToken,
    config().captureToken,
  );
});
test("HTTPS sends stable IDs, refuses redirects and verifies save acknowledgements", async () => {
  const note = { ...newNotebook().notes[0], content: "hello" };
  const request: typeof fetch = async (url, init) => {
    assert.equal(String(url), "https://mote.caten.top/api/notepad");
    assert.equal(init?.redirect, "error");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      `Bearer ${config().captureToken}`,
    );
    assert.equal(JSON.parse(init?.body as string).id, note.id);
    return Response.json({ id: note.id, content: "hello", version: 1 });
  };
  assert.equal((await syncNote(note, { ...config(), transport: "https" }, request)).version, 1);
  await assert.rejects(
    () =>
      syncNote(note, { ...config(), transport: "https" }, async () =>
        Response.json({ id: "wrong" }),
      ),
    /保存未确认/,
  );
  await assert.rejects(
    () =>
      syncNote(note, { ...config(), transport: "https" }, async () =>
        Response.json({ error: "conflict" }, { status: 409 }),
      ),
    (error) => error instanceof SyncError && error.conflict,
  );
});
test("switching server never silently sends historical drafts to another destination", async () => {
  const store = new Storage(mkdtempSync(join(tmpdir(), "mote-notes-")));
  let sent = 0;
  const c = new Controller(
    newNotebook(),
    config(),
    store,
    () => {},
    async (note) => {
      sent++;
      return { id: note.id, content: note.content, version: 1 };
    },
  );
  c.update("draft");
  c.configure({ ...config(), sshTarget: "other-server" });
  assert.equal(sent, 0);
  assert.equal(c.active.conflict, true);
  c.dispose();
});

test("floating window requires Raycast launch context and private file paths", async () => {
  const { launchOptions } = await import("../src/launch.ts");
  assert.equal(launchOptions(["Mote Notes.exe"]), null);
  assert.equal(launchOptions(["Mote Notes.exe", "--raycast"]), null);
  assert.equal(
    launchOptions([
      "Mote Notes.exe",
      "--raycast",
      "--config",
      "relative.json",
      "--data-dir",
      "relative",
    ]),
    null,
  );
  const configFile = join(tmpdir(), "notes-config.json"),
    data = join(tmpdir(), "notes-cache");
  assert.deepEqual(
    launchOptions(["Mote Notes.exe", "--raycast", "--config", configFile, "--data-dir", data]),
    { configurationFile: configFile, dataDirectory: data },
  );
});
