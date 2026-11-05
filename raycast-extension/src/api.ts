export function memoContent(memo: string, tags: string) {
  if (!memo.trim()) throw new Error("先写下一点想法吧");
  const normalizedTags = tags
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");
  const content = [memo.trim(), normalizedTags].filter(Boolean).join("\n");
  if (content.length > 50_000) throw new Error("记录不能超过 50,000 字");
  return content;
}
export function captureUrl(serverUrl: string) {
  const url = new URL(serverUrl.trim());
  if (url.username || url.password || url.search || url.hash || !["/", ""].includes(url.pathname))
    throw new Error("请填写 Mote 首页地址，例如 https://mote.caten.top");
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw new Error("服务器必须使用 HTTPS");
  return new URL("/api/capture", url).href;
}
export async function sendMemo(
  serverUrl: string,
  token: string,
  pending: { id: string; content: string },
  request: typeof fetch = fetch,
) {
  const response = await request(captureUrl(serverUrl), {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.trim()}`,
    },
    body: JSON.stringify(pending),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("服务器返回了登录页面，请检查 Mote 地址与访问保护设置");
  const body = (await response.json()) as {
    id?: string;
    content?: string;
    error?: string;
  };
  if (!response.ok) throw new Error(body.error || `发送失败（${response.status}）`);
  if (body.id !== pending.id || body.content !== pending.content)
    throw new Error("保存未确认，请保留草稿并重试");
  return body;
}
