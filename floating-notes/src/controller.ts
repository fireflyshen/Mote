import {
    connectionID,
    newNote,
    pending,
    type Configuration,
    type Notebook,
    type Note,
    type RemoteMemo,
} from "./model.ts";
import type { Storage } from "./storage.ts";
import { SyncError, syncNote } from "./sync.ts";
export interface Snapshot {
    notebook: Notebook;
    status: string;
    level: string;
    configured: boolean;
}
export class Controller {
    private debounce?: ReturnType<typeof setTimeout>;
    private syncingID: string | null = null;
    private errors = new Map<string, string>();
    private localError = "";
    readonly notebook: Notebook;
    private config: Configuration;
    private storage: Pick<Storage, "saveNotebook">;
    private publish: (state: Snapshot) => void;
    private sender: (note: Note, config: Configuration) => Promise<RemoteMemo>;
    constructor(
        notebook: Notebook,
        config: Configuration,
        storage: Pick<Storage, "saveNotebook">,
        publish: (state: Snapshot) => void = () => {},
        sender: (
            note: Note,
            config: Configuration,
        ) => Promise<RemoteMemo> = syncNote,
    ) {
        this.notebook = notebook;
        this.config = config;
        this.storage = storage;
        this.publish = publish;
        this.sender = sender;
        for (const note of notebook.notes)
            if (note.content && !note.connectionID)
                note.connectionID = connectionID(config);
    }
    get active() {
        return this.notebook.notes.find(
            (n) => n.id === this.notebook.activeID,
        )!;
    }
    snapshot(): Snapshot {
        const note = this.active;
        let status = "随手写下，自动同步",
            level = "idle";
        if (!this.config.captureToken) {
            status = "请在 Raycast 插件设置中填写速记令牌";
            level = "error";
        } else if (this.syncingID === note.id) {
            status = "正在同步…";
            level = "syncing";
        } else if (note.conflict) {
            status =
                this.errors.get(note.id) ||
                "记录已在其他页面修改，本机内容已保留";
            level = "conflict";
        } else if (this.errors.has(note.id)) {
            status = this.errors.get(note.id)!;
            level = "error";
        } else if (pending(note)) {
            status = "本机已保存 · 等待同步";
            level = "pending";
        } else if (note.version) {
            status = note.content.trim()
                ? "已同步到 Mote"
                : "空白保留在本机，服务器仍保留上次内容";
            level = "saved";
        }
        if (this.localError) {
            status = this.localError;
            level = "error";
        }
        return {
            notebook: structuredClone(this.notebook),
            status,
            level,
            configured: !!this.config.captureToken,
        };
    }
    private emit() {
        this.publish(this.snapshot());
    }
    private persist() {
        try {
            this.storage.saveNotebook(this.notebook);
            this.localError = "";
        } catch (error) {
            this.localError = "本机保存失败，请勿退出应用";
            this.emit();
            throw error;
        }
    }
    update(content: unknown) {
        if (typeof content !== "string" || content.length > 50_000)
            throw new Error("记录不能超过 50,000 字");
        this.active.content = content;
        this.active.connectionID ??= connectionID(this.config);
        this.persist();
        this.errors.delete(this.active.id);
        this.emit();
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => void this.sync(), 1200);
        this.debounce.unref?.();
        return this.snapshot();
    }
    select(id: unknown) {
        if (
            typeof id !== "string" ||
            !this.notebook.notes.some((n) => n.id === id)
        )
            throw new Error("记录不存在");
        this.persist();
        this.notebook.activeID = id;
        this.persist();
        this.emit();
        return this.snapshot();
    }
    create() {
        this.persist();
        if (this.active.content.trim()) {
            const note = newNote();
            this.notebook.notes.unshift(note);
            this.notebook.activeID = note.id;
            this.persist();
        }
        this.emit();
        void this.sync();
        return this.snapshot();
    }
    duplicate() {
        const note = {
            ...newNote(),
            content: this.active.content,
            connectionID: connectionID(this.config),
        };
        this.notebook.notes.unshift(note);
        this.notebook.activeID = note.id;
        this.persist();
        this.emit();
        void this.sync();
        return this.snapshot();
    }
    configure(config: Configuration) {
        this.config = config;
        this.errors.clear();
        this.emit();
        void this.sync();
    }
    async sync() {
        if (this.syncingID || !this.config.captureToken || this.localError)
            return;
        const note = this.notebook.notes.find((n) => pending(n) && !n.conflict);
        if (!note) return;
        if (
            note.connectionID &&
            note.connectionID !== connectionID(this.config)
        ) {
            note.conflict = true;
            this.errors.set(
                note.id,
                "连接已更改，本机内容已保留；可新建副本后同步",
            );
            this.persist();
            this.emit();
            return;
        }
        const submitted = structuredClone(note),
            config = structuredClone(this.config);
        this.syncingID = note.id;
        this.errors.delete(note.id);
        this.emit();
        let succeeded = false;
        try {
            const result = await this.sender(submitted, config);
            note.syncedContent = submitted.content;
            note.version = result.version;
            note.conflict = false;
            this.errors.delete(note.id);
            this.persist();
            succeeded = true;
        } catch (error) {
            this.errors.set(
                note.id,
                error instanceof Error
                    ? error.message
                    : "同步未完成，内容已保存在本机",
            );
            if (error instanceof SyncError && error.conflict) {
                note.conflict = true;
                this.persist();
            }
        } finally {
            this.syncingID = null;
            this.emit();
        }
        if (succeeded) await this.sync();
    }
    dispose() {
        clearTimeout(this.debounce);
        this.persist();
    }
}
