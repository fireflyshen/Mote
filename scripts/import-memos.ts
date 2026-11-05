import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openDatabase } from "../server/storage.ts";
import { rippleStore } from "../src/modules/ripple/server/store.ts";
const file = process.argv[2];
if (!file)
    throw new Error(
        "用法：npm run import:memos -- /path/to/ripple-or-mote.json",
    );
const db = openDatabase(
    resolve(process.env.MOTE_DB_FILE || "data/mote.sqlite"),
);
try {
    console.log(
        JSON.stringify(
            rippleStore(db).import(JSON.parse(readFileSync(file, "utf8"))),
        ),
    );
} finally {
    db.close();
}
