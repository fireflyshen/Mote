import { chmodSync, closeSync, mkdirSync, openSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
export function openDatabase(path: string) {
    if (path !== ":memory:") {
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        closeSync(openSync(path, "a", 0o600));
        chmodSync(path, 0o600);
    }
    const db = new DatabaseSync(path);
    db.exec(
        "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;",
    );
    return db;
}
export function isFileError(error: unknown, code: string) {
    return error instanceof Error && "code" in error && error.code === code;
}
