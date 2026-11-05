import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { openDatabase } from "../server/storage.ts";
import { createApp } from "../server/app.ts";
import { rippleStore } from "../src/modules/ripple/server/store.ts";
const password = "test-password-mote-123456";
async function fixture(secure = false) {
  const db = openDatabase(":memory:"),
    app = createApp(db, password, secure);
  const call = (
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    app(
      new Request(`https://mote.test/api${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  const login = await call("/login", "POST", { password });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const tokenResponse = await call("/capture-token", "POST", {}, { cookie });
  const { token } = await tokenResponse.json();
  return { db, call, cookie, token, login, store: rippleStore(db) };
}
test("private APIs require login; production cookie is secure and HttpOnly", async () => {
  const f = await fixture(true);
  try {
    assert.equal((await f.call("/notes")).status, 401);
    assert.match(
      f.login.headers.get("set-cookie")!,
      /HttpOnly; SameSite=Strict;.*Secure/,
    );
    assert.equal(
      (await f.call("/notes", "GET", undefined, { cookie: f.cookie })).status,
      200,
    );
    assert.equal(
      (await f.call("/login", "POST", { password: "bad" })).status,
      401,
    );
  } finally {
    f.db.close();
  }
});
test("capture token can create but cannot read, edit, export or rotate tokens", async () => {
  const f = await fixture();
  try {
    const h = { Authorization: `Bearer ${f.token}` };
    const note = await f.call(
      "/capture",
      "POST",
      { content: "碎片想法\n#阅读/书摘", createdDay: "2000-01-01" },
      h,
    );
    assert.equal(note.status, 201);
    const body = await note.json();
    assert.notEqual(body.day, "2000-01-01");
    for (const [p, m] of [
      ["/notes", "GET"],
      ["/export", "GET"],
      [`/notes/${body.id}`, "PATCH"],
      ["/capture-token", "POST"],
    ])
      assert.equal(
        (await f.call(p, m, m === "POST" || m === "PATCH" ? {} : undefined, h))
          .status,
        401,
      );
    assert.equal((await f.call("/capture", "GET", undefined, h)).status, 405);
  } finally {
    f.db.close();
  }
});
test("capture retries are idempotent and changed payloads conflict", async () => {
  const f = await fixture();
  try {
    const h = { Authorization: `Bearer ${f.token}` },
      note = { id: randomUUID(), content: "重试 #想法" };
    for (let i = 0; i < 2; i++)
      assert.equal((await f.call("/capture", "POST", note, h)).status, 201);
    assert.equal(f.store.summary().total, 1);
    assert.equal(
      (await f.call("/capture", "POST", { ...note, content: "changed" }, h))
        .status,
      409,
    );
  } finally {
    f.db.close();
  }
});
test("token rotation revokes previous token and logout revokes cookie", async () => {
  const f = await fixture();
  try {
    await f.call("/capture-token", "POST", {}, { cookie: f.cookie });
    assert.equal(
      (
        await f.call(
          "/capture",
          "POST",
          { content: "test" },
          { Authorization: `Bearer ${f.token}` },
        )
      ).status,
      401,
    );
    await f.call("/logout", "POST", {}, { cookie: f.cookie });
    assert.equal(
      (await f.call("/notes", "GET", undefined, { cookie: f.cookie })).status,
      401,
    );
  } finally {
    f.db.close();
  }
});
test("cross-site writes and invalid payloads are rejected", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (
        await f.call(
          "/login",
          "POST",
          { password },
          { Origin: "https://evil.test" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await f.call(
          "/capture-token",
          "POST",
          {},
          { cookie: f.cookie, "sec-fetch-site": "cross-site" },
        )
      ).status,
      403,
    );
    for (const content of ["", null, "x".repeat(50_001)])
      assert.equal(
        (
          await f.call(
            "/capture",
            "POST",
            { content },
            { Authorization: `Bearer ${f.token}` },
          )
        ).status,
        400,
      );
  } finally {
    f.db.close();
  }
});
test("edit conflicts preserve current version; trash and restore retain content", async () => {
  const f = await fixture();
  try {
    const note = f.store.create({ content: "初稿 #读书" });
    const updated = f.store.update(note.id, {
      content: "修订 #读书/书摘",
      version: note.version,
    });
    assert.throws(
      () =>
        f.store.update(note.id, { content: "stale", version: note.version }),
      /更新/,
    );
    assert.equal(f.store.get(note.id).content, updated.content);
    const deleted = f.store.update(note.id, {
      deleted: true,
      version: updated.version,
    });
    assert.equal(f.store.summary().total, 0);
    assert.equal(f.store.list(new URLSearchParams({ trash: "1" })).total, 1);
    f.store.update(note.id, { deleted: false, version: deleted.version });
    assert.equal(f.store.summary().total, 1);
    assert.equal(f.store.list(new URLSearchParams({ tag: "读书" })).total, 1);
  } finally {
    f.db.close();
  }
});
test("Ripple backups and history import losslessly, repeat import skips duplicates", () => {
  const source = openDatabase(":memory:"),
    target = openDatabase(":memory:");
  try {
    const a = rippleStore(source),
      b = rippleStore(target);
    const note = a.create({ content: "迁移 #测试" });
    a.update(note.id, { content: "迁移后 #测试", version: note.version });
    const backup = { ...a.export(), format: "ripple" };
    b.import(backup);
    assert.deepEqual(b.export().notes, a.export().notes);
    assert.deepEqual(b.export().history, a.export().history);
    b.import(backup);
    assert.equal(b.summary().total, 1);
    const before = b.export();
    assert.throws(() =>
      b.import({ ...backup, notes: [{ ...backup.notes[0], content: "冲突" }] }),
    );
    assert.deepEqual(b.export().notes, before.notes);
  } finally {
    source.close();
    target.close();
  }
});
test("login attempts are rate limited", async () => {
  const db = openDatabase(":memory:"),
    app = createApp(db, password);
  try {
    const call = () =>
      app(
        new Request("https://mote.test/api/login", {
          method: "POST",
          body: JSON.stringify({ password: "wrong" }),
        }),
        "attacker",
      );
    for (let i = 0; i < 10; i++) assert.equal((await call()).status, 401);
    assert.equal((await call()).status, 429);
  } finally {
    db.close();
  }
});
