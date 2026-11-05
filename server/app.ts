import type { DatabaseSync } from "node:sqlite";
import { HttpError, json, readJson } from "../src/shared/server/http.ts";
import { rippleStore } from "../src/modules/ripple/server/store.ts";
import { rippleApi } from "../src/modules/ripple/server/handler.ts";
import { createNotepad } from "./notepad.ts";
import { createAuth } from "./auth.ts";
export function createApp(db: DatabaseSync, password: string, secure = false) {
  const store = rippleStore(db),
    api = rippleApi(store),
    auth = createAuth(db, password, secure);
  const notepad = createNotepad(db, store);
  return async (request: Request, client = "local") => {
    try {
      const url = new URL(request.url);
      const response = await auth.route(request, client);
      if (response) return response;
      if (url.pathname === "/api/notepad") {
        if (!auth.capture(request))
          throw new HttpError(401, "速记令牌无效，请在网页设置中重新生成");
        if (request.method !== "POST") throw new HttpError(405, "只支持保存记事本");
        auth.sameOrigin(request);
        return json(notepad(await readJson(request, 512 * 1024)));
      }
      if (url.pathname === "/api/capture") {
        if (!auth.capture(request))
          throw new HttpError(401, "速记令牌无效，请在网页设置中重新生成");
        if (request.method !== "POST")
          throw new HttpError(405, "只支持新增记录");
        auth.sameOrigin(request);
        const body = (await readJson(request, 512 * 1024)) as Record<
          string,
          unknown
        > | null;
        // Capture credentials can only create content; no reads, import, update or backdating.
        return json(
          store.create({ id: body?.id, content: body?.content }),
          201,
        );
      }
      if (!auth.session(request))
        throw new HttpError(401, "请先登录，草稿已保留");
      url.pathname = url.pathname.replace(/^\/api/, "");
      return await api(new Request(url, request));
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message }, error.status);
      console.error("Mote API failed", error);
      return json({ error: "服务暂时不可用，草稿已保留" }, 500);
    }
  };
}
