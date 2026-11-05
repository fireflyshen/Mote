import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { json, secureAsset } from "../src/shared/server/http.ts";
import { createApp } from "./app.ts";
import { isFileError, openDatabase } from "./storage.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
    process.loadEnvFile(resolve(root, ".env.local"));
} catch (error) {
    if (!isFileError(error, "ENOENT")) throw error;
}
const production = process.env.NODE_ENV === "production";
const host = process.env.HOST || "127.0.0.1";
const database = openDatabase(
    resolve(process.env.MOTE_DB_FILE || resolve(root, "data", "mote.sqlite")),
);
const route = createApp(
    database,
    process.env.MOTE_PASSWORD || "",
    production && process.env.MOTE_COOKIE_SECURE !== "false",
);
const vite = production
    ? null
    : await (
          await import("vite")
      ).createServer({
          root,
          server: { middlewareMode: true },
          appType: "spa",
      });
const mime: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css",
    ".js": "text/javascript",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".png": "image/png",
    ".ico": "image/x-icon",
};

async function assets(url: URL) {
    let path;
    try {
        path = decodeURIComponent(url.pathname);
    } catch {
        return new Response("Bad request", { status: 400 });
    }
    const dist = resolve(root, "dist");
    let target = resolve(dist, `.${path}`);
    if (!target.startsWith(`${dist}/`) && target !== dist)
        return new Response("Forbidden", { status: 403 });
    try {
        if (!(await stat(target)).isFile())
            target = resolve(dist, "index.html");
    } catch (error) {
        if (!isFileError(error, "ENOENT")) throw error;
        if (extname(path)) return new Response("Not found", { status: 404 });
        target = resolve(dist, "index.html");
    }
    return secureAsset(
        new Response(await readFile(target), {
            headers: {
                "Content-Type":
                    mime[extname(target)] || "application/octet-stream",
            },
        }),
    );
}

const server = createServer(async (incoming, outgoing) => {
    try {
        const url = new URL(
            incoming.url || "/",
            `http://${incoming.headers.host || "localhost"}`,
        );
        if (url.pathname === "/healthz") {
            outgoing.writeHead(204).end();
            return;
        }
        if (!url.pathname.startsWith("/api/") && vite) {
            vite.middlewares(incoming, outgoing, () =>
                outgoing.writeHead(404).end("Not found"),
            );
            return;
        }
        const headers = new Headers();
        for (let index = 0; index < incoming.rawHeaders.length; index += 2)
            headers.append(
                incoming.rawHeaders[index],
                incoming.rawHeaders[index + 1],
            );
        const method = incoming.method || "GET";
        const request = new Request(url, {
            method,
            headers,
            ...(!["GET", "HEAD"].includes(method)
                ? {
                      body: Readable.toWeb(
                          incoming,
                      ) as ReadableStream<Uint8Array>,
                      duplex: "half",
                  }
                : {}),
        });
        const response = url.pathname.startsWith("/api/")
            ? await route(request, incoming.socket.remoteAddress || "unknown")
            : await assets(url);
        outgoing.writeHead(
            response.status,
            Object.fromEntries(response.headers),
        );
        if (incoming.method === "HEAD") outgoing.end();
        else outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
        console.error("Mote request failed", error);
        if (!outgoing.headersSent) {
            const response = json({ error: "服务暂时不可用" }, 500);
            outgoing.writeHead(500, Object.fromEntries(response.headers));
            outgoing.end(await response.text());
        } else outgoing.end();
    }
});
server.listen(
    Number(process.env.PORT ?? (production ? 4174 : 5174)),
    host,
    () => {
        console.log(
            `Mote 已启动：http://localhost:${(server.address() as import("node:net").AddressInfo).port}`,
        );
    },
);
