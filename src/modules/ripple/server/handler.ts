import { HttpError, json, readJson } from "../../../shared/server/http.ts";
import type { RippleStore } from "./store.ts";

export function rippleApi(store: RippleStore) {
    return async (request: Request) => {
        const url = new URL(request.url),
            path = url.pathname;
        if (!["GET", "HEAD"].includes(request.method)) {
            const origin = request.headers.get("origin");
            if (request.headers.get("sec-fetch-site") === "cross-site")
                throw new HttpError(403, "不允许跨站修改记录");
            if (origin) {
                let allowed = false;
                try {
                    const source = new URL(origin);
                    allowed =
                        ["http:", "https:"].includes(source.protocol) &&
                        source.host === url.host;
                } catch {
                    /* Reject invalid origin. */
                }
                if (!allowed) throw new HttpError(403, "不允许跨站修改记录");
            }
        }
        if (path === "/summary" && request.method === "GET")
            return json(store.summary());
        if (path === "/notes" && request.method === "GET")
            return json(store.list(url.searchParams));
        if (path === "/notes" && request.method === "POST")
            return json(store.create(await readJson(request, 512 * 1024)), 201);
        const match = /^\/notes\/([\da-f-]{36})$/i.exec(path);
        if (match && request.method === "GET") return json(store.get(match[1]));
        if (match && request.method === "PATCH")
            return json(
                store.update(match[1], await readJson(request, 512 * 1024)),
            );
        if (path === "/export" && request.method === "GET")
            return json(store.export(), 200, {
                "Content-Disposition": 'attachment; filename="mote.json"',
            });
        if (path === "/import" && request.method === "POST")
            return json(
                store.import(await readJson(request, 32 * 1024 * 1024)),
            );
        throw new HttpError(404, "接口不存在");
    };
}
