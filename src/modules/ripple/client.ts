export class MemoError extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}
export async function memoRequest<T>(
    path: string,
    options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
    const response = await fetch(`/api${path}`, {
        method: options.method,
        signal: options.signal ?? AbortSignal.timeout(15_000),
        ...(options.body === undefined
            ? {}
            : {
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(options.body),
              }),
    });
    if (!response.headers.get("content-type")?.includes("application/json"))
        throw new MemoError(
            "登录可能已过期，请刷新页面。草稿已保留。",
            response.status,
        );
    const body = await response.json();
    if (!response.ok)
        throw new MemoError(
            body.error || "保存未确认，输入已保留",
            response.status,
        );
    return body as T;
}
export const errorMessage = (error: unknown) =>
    error instanceof Error && error.name === "TimeoutError"
        ? "保存未确认，草稿已保留，请刷新核对。"
        : error instanceof Error
          ? error.message
          : "连接失败，输入已保留";
