// SSH transport for Raycast: token and content travel over stdin, never process arguments.
let input = "";
for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 512 * 1024) throw new Error("记录过大");
}
const payload = JSON.parse(input) as {
    token: string;
    id: string;
    content: string;
    version?: number;
};
const response = await fetch("http://127.0.0.1:4174/api/notepad", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${payload.token}`,
    },
    body: JSON.stringify({
        id: payload.id,
        content: payload.content,
        version: payload.version,
    }),
    signal: AbortSignal.timeout(15_000),
});
process.stdout.write(
    JSON.stringify({ status: response.status, body: await response.json() }),
);
