import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { HttpError } from "../../../shared/server/http.ts";
import { todayKey } from "../../../shared/date.ts";
import {
  extractTags,
  type Memo,
  type MemoList,
  type Summary,
} from "../model.ts";

interface Row {
  id: string;
  html: string;
  content: string;
  tags: string;
  day: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  pinned: number;
  version: number;
}
interface History {
  noteId: string;
  version: number;
  html: string;
  savedAt: string;
}
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new HttpError(400, "记录格式不正确");
  return input as Record<string, unknown>;
}
function text(value: unknown, limit: number): string {
  if (typeof value !== "string" || value.length > limit)
    throw new HttpError(400, "记录内容过长或格式不正确");
  return value;
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[\da-f-]{36}$/i.test(value))
    throw new HttpError(400, "记录编号不正确");
  return value;
}
function version(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new HttpError(400, "记录版本不正确");
  return value;
}
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    throw new HttpError(400, "日期格式不正确");
  return new Date(value).toISOString();
}
function dayTimestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1900-01-01" ||
    value > todayKey()
  )
    throw new HttpError(400, "请选择今天或之前的日期");
  const date = new Date(`${value}T12:00:00+08:00`);
  if (!Number.isFinite(+date) || todayKey(date) !== value)
    throw new HttpError(400, "日期不存在");
  return date.toISOString();
}
function normalized(value: unknown) {
  const content = text(value, 50_000).trim();
  if (!content) throw new HttpError(400, "先写下一点想法吧");
  const html = `<p>${content.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!).replace(/\n/g, "<br>")}</p>`;
  return { content, html, tags: JSON.stringify(extractTags(content)) };
}
function memo(row: Row): Memo {
  return {
    id: row.id,
    content: row.content,
    tags: JSON.parse(row.tags) as string[],
    day: row.day,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    version: row.version,
  };
}

// Ripple owns these tables. It never reads or writes another module's documents.
export function rippleStore(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS mote_notes (
    id TEXT PRIMARY KEY, html TEXT NOT NULL, content TEXT NOT NULL, tags TEXT NOT NULL,
    day TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
    pinned INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1);
    CREATE INDEX IF NOT EXISTS mote_notes_day ON mote_notes(day);
    CREATE INDEX IF NOT EXISTS mote_notes_order ON mote_notes(deleted_at, created_at);
    CREATE TABLE IF NOT EXISTS mote_history (note_id TEXT NOT NULL REFERENCES mote_notes(id),
      version INTEGER NOT NULL, html TEXT NOT NULL, saved_at TEXT NOT NULL, PRIMARY KEY(note_id, version));
    CREATE TABLE IF NOT EXISTS mote_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  const lookup = db.prepare("SELECT * FROM mote_notes WHERE id=?");
  const insert = db.prepare(
    "INSERT INTO mote_notes VALUES (?,?,?,?,?,?,?,?,?,?)",
  );
  const historyInsert = db.prepare("INSERT INTO mote_history VALUES (?,?,?,?)");
  function row(id: string): Row {
    const result = lookup.get(identifier(id)) as unknown as Row | undefined;
    if (!result) throw new HttpError(404, "这条记录不存在");
    return result;
  }
  function transaction<T>(run: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return {
    get: (id: string) => memo(row(id)),
    list(params: URLSearchParams): MemoList {
      const trash = params.get("trash") === "1";
      const where = [trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
      const args: SQLInputValue[] = [];
      const query = params.get("q") || "",
        tag = params.get("tag") || "",
        day = params.get("day") || "";
      const year = params.get("year");
      if (query) {
        where.push("instr(lower(content),lower(?))>0");
        args.push(query);
      }
      if (tag) {
        where.push(
          "EXISTS (SELECT 1 FROM json_each(mote_notes.tags) WHERE value=? OR substr(value,1,length(?)+1)=?||'/')",
        );
        args.push(tag, tag, tag);
      }
      if (day) {
        where.push("day=?");
        args.push(day);
      }
      if (year) {
        where.push("substr(day,1,4)=?");
        args.push(year);
      }
      const offset = Number(params.get("offset") || 0);
      if (!Number.isSafeInteger(offset) || offset < 0)
        throw new HttpError(400, "分页参数不正确");
      const sort = params.get("sort") || "newest";
      if (sort !== "newest" && sort !== "oldest")
        throw new HttpError(400, "排序参数不正确");
      const direction = sort === "oldest" ? "ASC" : "DESC";
      const filter = where.join(" AND ");
      const total = db
        .prepare(`SELECT count(*) AS n FROM mote_notes WHERE ${filter}`)
        .get(...args)!.n as number;
      const notes = (
        db
          .prepare(
            `SELECT * FROM mote_notes WHERE ${filter} ORDER BY created_at ${direction},id ${direction} LIMIT 50 OFFSET ?`,
          )
          .all(...args, offset) as unknown as Row[]
      ).map(memo);
      return { notes, total, hasMore: offset + notes.length < total };
    },
    create(input: unknown): Memo {
      const item = object(input),
        value = normalized(item.content),
        id = identifier(item.id ?? randomUUID());
      const now = new Date().toISOString();
      const created = item.createdDay ? dayTimestamp(item.createdDay) : now;
      return transaction(() => {
        const previous = lookup.get(id) as unknown as Row | undefined;
        if (previous) {
          if (
            !previous.deleted_at &&
            previous.content === value.content &&
            (!item.createdDay || previous.day === item.createdDay)
          )
            return memo(previous);
          throw new HttpError(
            409,
            "上次提交的记录已存在，请刷新核对。输入已保留。",
          );
        }
        insert.run(
          id,
          value.html,
          value.content,
          value.tags,
          todayKey(new Date(created)),
          created,
          now,
          null,
          0,
          1,
        );
        return memo(row(id));
      });
    },
    update(id: string, input: unknown): Memo {
      const item = object(input);
      if (item.content === undefined && item.deleted === undefined)
        throw new HttpError(400, "缺少修改内容");
      return transaction(() => {
        const old = row(id);
        if (version(item.version) !== old.version)
          throw new HttpError(
            409,
            "这条记录已在其他页面更新。输入已保留，请核对最新内容。",
          );
        if (item.deleted !== undefined && typeof item.deleted !== "boolean")
          throw new HttpError(400, "回收站参数不正确");
        if (old.deleted_at && item.content !== undefined)
          throw new HttpError(409, "这条记录已移到回收站，请先恢复");
        const value =
          item.content === undefined ? old : normalized(item.content);
        const now = new Date().toISOString();
        historyInsert.run(id, old.version, old.html, old.updated_at);
        db.prepare(
          "UPDATE mote_notes SET html=?,content=?,tags=?,updated_at=?,deleted_at=?,version=version+1 WHERE id=?",
        ).run(
          value.html,
          value.content,
          value.tags,
          now,
          item.deleted === true
            ? now
            : item.deleted === false
              ? null
              : old.deleted_at,
          id,
        );
        return memo(row(id));
      });
    },
    summary(): Summary {
      const rows = db
        .prepare("SELECT day,tags FROM mote_notes WHERE deleted_at IS NULL")
        .all() as { day: string; tags: string }[];
      const daily: Record<string, number> = {},
        tags: Record<string, number> = {};
      for (const note of rows) {
        daily[note.day] = (daily[note.day] || 0) + 1;
        const inNote = new Set<string>();
        for (const tag of JSON.parse(note.tags) as string[]) {
          const parts = tag.split("/");
          parts.forEach((_, i) => inNote.add(parts.slice(0, i + 1).join("/")));
        }
        for (const tag of inNote) tags[tag] = (tags[tag] || 0) + 1;
      }
      return {
        total: rows.length,
        days: Object.keys(daily).length,
        daily,
        tags: Object.entries(tags)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
        trash: db
          .prepare(
            "SELECT count(*) AS n FROM mote_notes WHERE deleted_at IS NOT NULL",
          )
          .get()!.n as number,
      };
    },
    export() {
      return transaction(() => ({
        format: "mote",
        version: 1,
        exportedAt: new Date().toISOString(),
        timeZone: "Asia/Shanghai",
        settings: JSON.parse(
          (db
            .prepare("SELECT value FROM mote_settings WHERE key='legacy'")
            .get()?.value as string) || "{}",
        ) as unknown,
        notes: (
          db
            .prepare("SELECT * FROM mote_notes ORDER BY created_at,id")
            .all() as unknown as Row[]
        ).map((item) => ({
          ...memo(item),
          html: item.html,
          pinned: !!item.pinned,
        })),
        history: db
          .prepare(
            "SELECT note_id AS noteId,version,html,saved_at AS savedAt FROM mote_history ORDER BY note_id,version",
          )
          .all() as unknown as History[],
      }));
    },
    import(input: unknown) {
      const data = object(input);
      if (
        !["ripple", "mote"].includes(String(data.format)) ||
        data.version !== 1 ||
        !Array.isArray(data.notes) ||
        data.notes.length > 100_000
      )
        throw new HttpError(400, "请选择 Ripple 导出的 JSON 文件");
      const notes = data.notes.map((value: unknown) => {
        const item = object(value),
          normal = normalized(item.content);
        const created = timestamp(item.createdAt);
        // Legacy HTML stays opaque in backups. Pages render only content as React text.
        return {
          ...normal,
          id: identifier(item.id),
          html:
            item.html === undefined ? normal.html : text(item.html, 400_000),
          day: todayKey(new Date(created)),
          created_at: created,
          updated_at: timestamp(item.updatedAt),
          deleted_at:
            item.deletedAt === null || item.deletedAt === undefined
              ? null
              : timestamp(item.deletedAt),
          pinned: Number(!!item.pinned),
          version: version(item.version),
        } satisfies Row;
      });
      if (
        data.history !== undefined &&
        (!Array.isArray(data.history) || data.history.length > 500_000)
      )
        throw new HttpError(400, "历史版本格式不正确");
      const history = ((data.history || []) as unknown[]).map((value) => {
        const item = object(value);
        return {
          noteId: identifier(item.noteId),
          version: version(item.version),
          html: text(item.html, 400_000),
          savedAt: timestamp(item.savedAt),
        };
      });
      return transaction(() => {
        let added = 0;
        for (const note of notes) {
          const old = lookup.get(note.id) as unknown as Row | undefined;
          if (old) {
            if (
              Object.keys(note).some(
                (key) => old[key as keyof Row] !== note[key as keyof Row],
              )
            )
              throw new HttpError(409, "备份与现有记录不同，未导入任何内容");
          } else {
            insert.run(
              note.id,
              note.html,
              note.content,
              note.tags,
              note.day,
              note.created_at,
              note.updated_at,
              note.deleted_at,
              note.pinned,
              note.version,
            );
            added++;
          }
        }
        for (const item of history) {
          if (item.version >= row(item.noteId).version)
            throw new HttpError(400, "历史版本必须早于当前记录");
          const old = db
            .prepare(
              "SELECT html,saved_at FROM mote_history WHERE note_id=? AND version=?",
            )
            .get(item.noteId, item.version);
          if (old) {
            if (old.html !== item.html || old.saved_at !== item.savedAt)
              throw new HttpError(409, "历史版本冲突，未导入任何内容");
          } else
            historyInsert.run(
              item.noteId,
              item.version,
              item.html,
              item.savedAt,
            );
        }
        if (
          data.settings !== undefined &&
          !db.prepare("SELECT key FROM mote_settings WHERE key='legacy'").get()
        )
          db.prepare("INSERT INTO mote_settings VALUES (?,?)").run(
            "legacy",
            JSON.stringify(object(data.settings)),
          );
        return { added, skipped: notes.length - added };
      });
    },
  };
}
export type RippleStore = ReturnType<typeof rippleStore>;
