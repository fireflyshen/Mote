import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { HttpError, json, readJson } from "../src/shared/server/http.ts";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function createAuth(
  db: DatabaseSync,
  password: string,
  secure: boolean,
) {
  if (password.length < 16) throw new Error("请设置至少 16 位的 MOTE_PASSWORD");
  const salt = randomBytes(32),
    passwordHash = scryptSync(password, salt, 32);
  db.exec(`CREATE TABLE IF NOT EXISTS mote_sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS mote_tokens (name TEXT PRIMARY KEY, hash TEXT NOT NULL);`);
  const attempts = new Map<string, { count: number; expires: number }>();
  const cookie = (value: string, age: number) =>
    `mote_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? "; Secure" : ""}`;
  function session(request: Request) {
    const value = /(?:^|;\s*)mote_session=([^;]+)/.exec(
      request.headers.get("cookie") || "",
    )?.[1];
    return (
      !!value &&
      !!db
        .prepare("SELECT hash FROM mote_sessions WHERE hash=? AND expires>?")
        .get(digest(value), Date.now())
    );
  }
  function capture(request: Request) {
    const bearer = /^Bearer ([a-zA-Z0-9_-]+)$/.exec(
      request.headers.get("authorization") || "",
    )?.[1];
    if (!bearer) return false;
    const row = db
      .prepare("SELECT hash FROM mote_tokens WHERE name='capture'")
      .get() as { hash: string } | undefined;
    return (
      !!row &&
      timingSafeEqual(Buffer.from(digest(bearer)), Buffer.from(row.hash))
    );
  }
  function sameOrigin(request: Request) {
    const origin = request.headers.get("origin");
    if (
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin && new URL(origin).host !== new URL(request.url).host)
    )
      throw new HttpError(403, "不允许跨站请求");
  }
  return {
    session,
    capture,
    sameOrigin,
    async route(request: Request, client: string): Promise<Response | null> {
      const path = new URL(request.url).pathname;
      if (path === "/api/session" && request.method === "GET")
        return json({ authenticated: session(request) });
      if (path === "/api/login" && request.method === "POST") {
        sameOrigin(request);
        const now = Date.now();
        for (const [key, value] of attempts)
          if (value.expires <= now) attempts.delete(key);
        const attempt = attempts.get(client) || {
          count: 0,
          expires: now + 15 * 60_000,
        };
        if (attempt.count >= 10)
          throw new HttpError(429, "尝试次数过多，请 15 分钟后再试");
        if (attempts.size > 5000 && !attempts.has(client))
          throw new HttpError(429, "请稍后重试");
        attempt.count++;
        attempts.set(client, attempt);
        const input = (await readJson(request, 4096)) as {
          password?: unknown;
        } | null;
        const candidate =
          typeof input?.password === "string" ? input.password : "";
        if (!timingSafeEqual(scryptSync(candidate, salt, 32), passwordHash))
          throw new HttpError(401, "密码不正确");
        attempts.delete(client);
        db.prepare("DELETE FROM mote_sessions WHERE expires<=?").run(now);
        const token = randomBytes(32).toString("base64url");
        db.prepare("INSERT INTO mote_sessions VALUES (?,?)").run(
          digest(token),
          now + 30 * 86400_000,
        );
        return json({ authenticated: true }, 200, {
          "Set-Cookie": cookie(token, 30 * 86400),
        });
      }
      if (path === "/api/logout" && request.method === "POST") {
        sameOrigin(request);
        const token = /(?:^|;\s*)mote_session=([^;]+)/.exec(
          request.headers.get("cookie") || "",
        )?.[1];
        if (token)
          db.prepare("DELETE FROM mote_sessions WHERE hash=?").run(
            digest(token),
          );
        return json({ authenticated: false }, 200, {
          "Set-Cookie": cookie("", 0),
        });
      }
      if (path === "/api/capture-token" && request.method === "POST") {
        if (!session(request)) throw new HttpError(401, "请先登录");
        sameOrigin(request);
        const token = randomBytes(32).toString("base64url");
        db.prepare(
          "INSERT INTO mote_tokens VALUES ('capture',?) ON CONFLICT(name) DO UPDATE SET hash=excluded.hash",
        ).run(digest(token));
        return json({ token });
      }
      return null;
    },
  };
}
