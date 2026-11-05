import assert from "node:assert/strict";
import test from "node:test";
import { captureUrl, memoContent, sendMemo } from "../src/api.ts";
test("matches flomo content/tag interaction", () => {
  assert.equal(memoContent("想法", "阅读 #生活"), "想法\n#阅读 #生活");
  assert.throws(() => memoContent(" ", "#tag"));
  assert.throws(() => memoContent("x".repeat(50_001), ""));
});
test("only HTTPS or local HTTP, no URL credentials or paths", () => {
  assert.equal(captureUrl("https://mote.test/"), "https://mote.test/api/capture");
  assert.equal(captureUrl("http://127.0.0.1:5174"), "http://127.0.0.1:5174/api/capture");
  for (const url of [
    "http://example.com",
    "https://user:password@mote.test",
    "https://mote.test/path",
    "https://mote.test/?token=secret",
  ])
    assert.throws(() => captureUrl(url));
});
test("sends bearer and stable ID; only confirms matching saved memo", async () => {
  const note = { id: "stable-id", content: "hello" };
  const request: typeof fetch = async (url, init) => {
    assert.equal(url, "https://mote.test/api/capture");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer token");
    assert.equal(init?.body, JSON.stringify(note));
    return Response.json(note, { status: 201 });
  };
  assert.equal((await sendMemo("https://mote.test", "token", note, request)).id, note.id);
  await assert.rejects(
    () =>
      sendMemo("https://mote.test", "token", note, async () =>
        Response.json({ error: "令牌无效" }, { status: 401 }),
      ),
    /令牌无效/,
  );
  await assert.rejects(
    () => sendMemo("https://mote.test", "token", note, async () => Response.json({ id: "wrong" })),
    /保存未确认/,
  );
  await assert.rejects(
    () =>
      sendMemo(
        "https://mote.test",
        "token",
        note,
        async () => new Response("Login", { headers: { "content-type": "text/html" } }),
      ),
    /登录页面/,
  );
});
