import { useLayoutEffect, useRef, useState } from "react";
import { todayKey } from "../../shared/date";
import { DraftNotice } from "../../shared/ui/DraftNotice";
import {
    DrawerContent,
    DrawerHeading,
    DrawerShell,
} from "../../shared/ui/Drawer";
import { useLocalDraft } from "../../shared/useLocalDraft";
import { MemoGlyph, MemoMenu } from "./MemoControls";
import { newDraft, type Memo, type MemoDraft } from "./model";

function insertAtCursor(
    field: HTMLTextAreaElement | null,
    content: string,
    text: string,
    update: (next: string) => void,
) {
    if (!field) return;
    const start = field.selectionStart,
        end = field.selectionEnd;
    const prefix =
        start && !/\s/.test(content[start - 1])
            ? text === "#"
                ? " "
                : "\n"
            : "";
    update(content.slice(0, start) + prefix + text + content.slice(end));
    requestAnimationFrame(() => {
        field.focus();
        const cursor = start + prefix.length + text.length;
        field.setSelectionRange(cursor, cursor);
    });
}

export function MemoComposer({
    day,
    saving,
    onSave,
    onReset,
    onDirty,
}: {
    day: string | null;
    saving: boolean;
    onSave: (draft: MemoDraft) => Promise<boolean>;
    onReset: () => void;
    onDirty: (dirty: boolean) => void;
}) {
    const local = useLocalDraft<MemoDraft>("mote:compose", "new", () => ({
        ...newDraft(),
        day: day || todayKey(),
    }));
    const pending = useRef(false);
    const textarea = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        if (local.dirty && !local.value.content.trim()) {
            local.clear();
            onDirty(false);
        }
        const field = textarea.current;
        if (!field) return;
        field.style.height = "0px";
        field.style.height = `${Math.min(field.scrollHeight, 320)}px`;
    }, [local, onDirty]);
    const insert = (text: string) => {
        insertAtCursor(textarea.current, local.value.content, text, (next) => {
            local.update({ ...local.value, content: next });
            onDirty(true);
        });
    };
    const persist = async () => {
        if (!local.value.content.trim() || saving || pending.current) return;
        pending.current = true;
        try {
            if (await onSave(local.value)) {
                local.clear();
                onDirty(false);
                onReset();
            }
        } finally {
            pending.current = false;
        }
    };
    return (
        <section className="memo-composer" aria-label="写一条 Memos">
            <textarea
                ref={textarea}
                aria-label="记录内容"
                placeholder="现在的想法是…"
                maxLength={50_000}
                value={local.value.content}
                disabled={saving}
                onChange={(event) => {
                    const content = event.target.value;
                    local.update({ ...local.value, content });
                    if (!content.trim()) {
                        local.clear();
                        onDirty(false);
                    } else onDirty(true);
                }}
                onKeyDown={(event) => {
                    if (
                        (event.metaKey || event.ctrlKey) &&
                        event.key === "Enter" &&
                        !event.nativeEvent.isComposing
                    ) {
                        event.preventDefault();
                        void persist();
                    }
                }}
            />
            <div className="memo-composer-actions">
                <div className="memo-format-tools">
                    <button
                        type="button"
                        aria-label="插入标签"
                        title="插入标签"
                        disabled={saving}
                        onClick={() => insert("#")}
                    >
                        <MemoGlyph name="tag" />
                    </button>
                    <span className="memo-tool-divider" />
                    <button
                        type="button"
                        aria-label="插入无序列表"
                        title="插入无序列表"
                        disabled={saving}
                        onClick={() => insert("- ")}
                    >
                        <MemoGlyph name="list" />
                    </button>
                    <button
                        type="button"
                        aria-label="插入有序列表"
                        title="插入有序列表"
                        disabled={saving}
                        onClick={() => insert("1. ")}
                    >
                        <MemoGlyph name="ordered" />
                    </button>
                    <span className="memo-tool-divider" />
                    <MemoMenu
                        label="记录日期与草稿"
                        trigger={<MemoGlyph name="calendar" />}
                        className="memo-compose-menu"
                    >
                        <>
                            <label className="memo-date-label">
                                记录日期
                                <input
                                    aria-label="记录日期"
                                    type="date"
                                    min="1900-01-01"
                                    max={todayKey()}
                                    value={local.value.day}
                                    disabled={saving}
                                    onChange={(event) => {
                                        if (
                                            event.target.validity.valid &&
                                            event.target.value
                                        )
                                            local.update({
                                                ...local.value,
                                                day: event.target.value,
                                            });
                                    }}
                                />
                            </label>
                            {local.dirty && (
                                <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => {
                                        local.clear();
                                        onDirty(false);
                                        onReset();
                                    }}
                                >
                                    清空草稿
                                </button>
                            )}
                        </>
                    </MemoMenu>
                </div>
                {local.value.day !== todayKey() && (
                    <span className="memo-compose-day">{local.value.day}</span>
                )}
                <span
                    className="memo-draft-state"
                    role="status"
                    data-error={local.localError || undefined}
                >
                    {local.localError
                        ? "本机暂存不可用，请保持页面打开"
                        : local.dirty
                          ? "草稿已保留"
                          : ""}
                </span>
                <button
                    type="button"
                    className="memo-send"
                    aria-label={saving ? "保存中…" : "记录"}
                    title="记录 · ⌘ / Ctrl + Enter"
                    disabled={saving || !local.value.content.trim()}
                    onClick={() => void persist()}
                >
                    <MemoGlyph name="send" />
                </button>
            </div>
        </section>
    );
}

export function MemoEditor({
    note,
    saving,
    error,
    onSave,
    onReload,
    onClose,
}: {
    note: Memo;
    saving: boolean;
    error: string;
    onSave: (content: string) => Promise<boolean>;
    onReload: () => void;
    onClose: () => void;
}) {
    const local = useLocalDraft(
        `mote:edit:${note.id}`,
        String(note.version),
        () => note.content,
    );
    const [saved, setSaved] = useState(false);
    const textarea = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        const field = textarea.current;
        if (!field) return;
        field.style.height = "0px";
        field.style.height = `${Math.min(Math.max(field.scrollHeight, 132), 360)}px`;
    }, [local.value]);
    const persist = async () => {
        if (saved || !local.dirty) return true;
        if (local.value.trim() === note.content.trim()) {
            local.clear();
            return true;
        }
        if (local.conflict || !local.value.trim()) return false;
        if (!(await onSave(local.value))) return false;
        local.clear();
        setSaved(true);
        return true;
    };
    return (
        <DrawerShell
            labelledBy="memo-edit-title"
            closeLabel="关闭 Memos 编辑"
            busy={saving}
            onClosed={onClose}
            onBeforeClose={persist}
            closeRequested={saved}
        >
            {error && (
                <div className="draft-notice" role="alert">
                    <span>{error}</span>
                    <button
                        type="button"
                        className="text-button"
                        onClick={onReload}
                    >
                        读取最新版本
                    </button>
                </div>
            )}
            <DraftNotice
                conflict={local.conflict}
                restored={local.restored && local.dirty}
                localError={local.localError}
                onAccept={local.accept}
                onDiscard={() => {
                    local.clear();
                    onClose();
                }}
            />
            <DrawerContent
                className="journal-drawer memo-edit"
                inert={saving}
                heading={
                    <DrawerHeading
                        id="memo-edit-title"
                        title="编辑 MEMO"
                        eyebrow={note.day}
                    />
                }
            >
                {local.conflict && (
                    <section className="memo-conflict">
                        <h3>最新内容</h3>
                        <p>{note.content}</p>
                    </section>
                )}
                <textarea
                    ref={textarea}
                    aria-label="编辑记录内容"
                    value={local.value}
                    maxLength={50_000}
                    onChange={(event) => local.update(event.target.value)}
                    onKeyDown={(event) => {
                        if (
                            (event.metaKey || event.ctrlKey) &&
                            event.key === "Enter" &&
                            !event.nativeEvent.isComposing
                        ) {
                            event.preventDefault();
                            void persist();
                        }
                    }}
                />
                <div className="memo-edit-actions">
                    <div className="memo-format-tools">
                        <button
                            type="button"
                            aria-label="插入标签"
                            title="插入标签"
                            disabled={saving}
                            onClick={() =>
                                insertAtCursor(
                                    textarea.current,
                                    local.value,
                                    "#",
                                    local.update,
                                )
                            }
                        >
                            <MemoGlyph name="tag" />
                        </button>
                        <span className="memo-tool-divider" />
                        <button
                            type="button"
                            aria-label="插入无序列表"
                            title="插入无序列表"
                            disabled={saving}
                            onClick={() =>
                                insertAtCursor(
                                    textarea.current,
                                    local.value,
                                    "- ",
                                    local.update,
                                )
                            }
                        >
                            <MemoGlyph name="list" />
                        </button>
                        <button
                            type="button"
                            aria-label="插入有序列表"
                            title="插入有序列表"
                            disabled={saving}
                            onClick={() =>
                                insertAtCursor(
                                    textarea.current,
                                    local.value,
                                    "1. ",
                                    local.update,
                                )
                            }
                        >
                            <MemoGlyph name="ordered" />
                        </button>
                    </div>
                    <button
                        type="button"
                        className="memo-save"
                        title="保存 · ⌘ / Ctrl + Enter"
                        disabled={
                            saving ||
                            local.conflict ||
                            !local.value.trim() ||
                            !local.dirty
                        }
                        onClick={() => void persist()}
                    >
                        保存
                    </button>
                </div>
            </DrawerContent>
        </DrawerShell>
    );
}
