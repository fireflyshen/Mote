import type { DatabaseSync } from "node:sqlite";
import { HttpError } from "../src/shared/server/http.ts";
import type { RippleStore } from "../src/modules/ripple/server/store.ts";
export function createNotepad(db: DatabaseSync, store: RippleStore) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS mote_notepad_notes (note_id TEXT PRIMARY KEY REFERENCES mote_notes(id))",
  );
  return (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new HttpError(400, "记录格式不正确");
    const item = input as Record<string, unknown>;
    if (typeof item.id !== "string" || !/^[\da-f-]{36}$/i.test(item.id))
      throw new HttpError(400, "记录编号不正确");
    if (typeof item.content !== "string" || !item.content.trim() || item.content.length > 50_000)
      throw new HttpError(400, "请输入 1 至 50,000 字的内容");
    const owned = db.prepare("SELECT note_id FROM mote_notepad_notes WHERE note_id=?").get(item.id);
    if (!owned) {
      // A floating note cannot claim or overwrite a memo created elsewhere.
      if (db.prepare("SELECT id FROM mote_notes WHERE id=?").get(item.id))
        throw new HttpError(409, "记录已存在，请新建一条记事本记录");
      return store.create({ id: item.id, content: item.content }, (note) => {
        db.prepare("INSERT INTO mote_notepad_notes VALUES (?)").run(note.id);
      });
    }
    const current = store.get(item.id);
    if (current.deletedAt)
      throw new HttpError(409, "这条记录已移到回收站，本机内容已保留，请新建记录");
    if (current.content === item.content.trim()) return current;
    if (item.version !== current.version)
      throw new HttpError(409, "这条记录已在网页更新，本机内容已保留；请在新记录中继续");
    return store.update(item.id, { version: current.version, content: item.content });
  };
}
