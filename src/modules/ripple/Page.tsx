import { useCallback, useEffect, useRef, useState } from "react";
import { todayKey } from "../../shared/date";
import { clearDraft, latestDraft, readDraft } from "../../shared/drafts";
import { useNavigationGuard } from "../../shared/navigation";
import { DownloadIcon } from "../../shared/ui/Icons";
import { PixelLoader } from "../../shared/ui/PixelLoader";
import { MemoComposer, MemoEditor } from "./MemoForm";
import { MemoGlyph, MemoMenu } from "./MemoControls";
import { errorMessage, memoRequest } from "./client";
import {
    type Memo,
    type MemoDraft,
    type MemoList,
    type Summary,
} from "./model";
import "../../shared/styles/journal.css";
import "./module.css";

const dateFormat = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});
const updatedFormat = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "short",
    day: "numeric",
});
const memoWordCount = (text: string) => text.replace(/\s+/g, "").length;
function Highlight({ text, query }: { text: string; query: string }) {
    if (!query.trim()) return text;
    const pattern = new RegExp(
        `(${query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
        "gi",
    );
    return text
        .split(pattern)
        .map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}
function MemoText({
    note,
    query,
    onTag,
}: {
    note: Memo;
    query: string;
    onTag: (tag: string) => void;
}) {
    const content = note.content
        .split("\n")
        .filter((line) => !/^\s*(?:#[\p{L}\p{N}_/-]+(?:\s+|$))+$/u.test(line))
        .join("\n")
        .trimEnd();
    // Never insert HTML, including legacy rich text from Ripple backups.
    return (
        <>
            {content && (
                <div className="memo-text">
                    {content.split(/\n{2,}/).map((paragraph, index) => (
                        <p key={index}>
                            {paragraph
                                .split(/(https?:\/\/[^\s<>]+)/gu)
                                .map((part, i) =>
                                    /^https?:\/\//.test(part) ? (
                                        <a
                                            key={i}
                                            href={part}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <Highlight
                                                text={part}
                                                query={query}
                                            />
                                        </a>
                                    ) : (
                                        <Highlight
                                            key={i}
                                            text={part}
                                            query={query}
                                        />
                                    ),
                                )}
                        </p>
                    ))}
                </div>
            )}
            {!!note.tags.length && (
                <footer className="memo-tags">
                    {note.tags.map((tag) => (
                        <button
                            key={tag}
                            type="button"
                            className="memo-tag"
                            onClick={() => onTag(tag)}
                        >
                            #{tag}
                        </button>
                    ))}
                </footer>
            )}
        </>
    );
}

export default function MotePage() {
    const [day, setDay] = useState<string | null>(() => {
        const value = new URLSearchParams(location.search).get("day");
        return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= todayKey()
            ? value
            : null;
    });
    const [query, setQuery] = useState("");
    const [tag, setTag] = useState("");
    const [trash, setTrash] = useState(false);
    const [sort, setSort] = useState<"newest" | "oldest">("newest");
    const [searchOpen, setSearchOpen] = useState(false);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [list, setList] = useState<MemoList>({
        notes: [],
        total: 0,
        hasMore: false,
    });
    const [listedParams, setListedParams] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [refresh, setRefresh] = useState(0);
    const [composer, setComposer] = useState(0);
    const [dirty, setDirty] = useState(
        () => !!readDraft<MemoDraft>("mote:compose")?.value?.content?.trim(),
    );
    const [editId, setEditId] = useState<string | null>(() =>
        latestDraft("mote:edit:"),
    );
    const [editing, setEditing] = useState<Memo | null>(null);
    const [editAttempt, setEditAttempt] = useState(0);
    const [editError, setEditError] = useState("");
    const busy = useRef(false);
    const generation = useRef(0);
    const fileInput = useRef<HTMLInputElement>(null);
    const searchInput = useRef<HTMLInputElement>(null);
    const searchArea = useRef<HTMLDivElement>(null);
    const reload = useCallback(() => setRefresh((value) => value + 1), []);
    const params = new URLSearchParams({
        ...(day ? { day } : {}),
        ...(query.trim() ? { q: query.trim() } : {}),
        ...(tag ? { tag } : {}),
        ...(trash ? { trash: "1" } : {}),
        ...(sort === "oldest" ? { sort } : {}),
    }).toString();
    useNavigationGuard(saving || editId !== null);

    useEffect(() => {
        const shortcut = (event: KeyboardEvent) => {
            if (
                (event.metaKey || event.ctrlKey) &&
                event.key.toLowerCase() === "k"
            ) {
                event.preventDefault();
                searchInput.current?.focus();
            }
        };
        const dismiss = (event: PointerEvent) => {
            if (!searchArea.current?.contains(event.target as Node))
                setSearchOpen(false);
        };
        document.addEventListener("keydown", shortcut);
        document.addEventListener("pointerdown", dismiss);
        return () => {
            document.removeEventListener("keydown", shortcut);
            document.removeEventListener("pointerdown", dismiss);
        };
    }, []);

    useEffect(() => {
        generation.current++;
        const controller = new AbortController();
        const timer = window.setTimeout(
            () => {
                setLoading(true);
                Promise.all([
                    memoRequest<Summary>("/summary", {
                        signal: controller.signal,
                    }),
                    memoRequest<MemoList>(`/notes?${params}`, {
                        signal: controller.signal,
                    }),
                ])
                    .then(([summary, list]) => {
                        if (!controller.signal.aborted) {
                            setSummary(summary);
                            setList(list);
                            setListedParams(params);
                            setError("");
                        }
                    })
                    .catch((error) => {
                        if (!controller.signal.aborted)
                            setError(errorMessage(error));
                    })
                    .finally(() => {
                        if (!controller.signal.aborted) setLoading(false);
                    });
            },
            query ? 180 : 0,
        );
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [params, query, refresh]);
    useEffect(() => {
        if (!editId) return;
        const controller = new AbortController();
        memoRequest<Memo>(`/notes/${editId}`, { signal: controller.signal })
            .then((note) => {
                if (controller.signal.aborted) return;
                if (note.deletedAt) {
                    clearDraft(`mote:edit:${editId}`);
                    setEditId(null);
                    setEditing(null);
                    setEditError("");
                    return;
                }
                setEditing(note);
                setEditError("");
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                if (
                    error instanceof Object &&
                    "status" in error &&
                    (error as { status: number }).status === 404
                ) {
                    clearDraft(`mote:edit:${editId}`);
                    setEditId(null);
                    setEditing(null);
                    setEditError("");
                    return;
                }
                setEditError(errorMessage(error));
            });
        return () => controller.abort();
    }, [editId, editAttempt]);
    useEffect(() => {
        const check = () => {
            if (
                document.visibilityState === "visible" &&
                !dirty &&
                !saving &&
                !editId
            )
                reload();
        };
        const timer = window.setInterval(check, 30_000);
        document.addEventListener("visibilitychange", check);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", check);
        };
    }, [dirty, saving, editId, reload]);
    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(""), 2_200);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const mutate = async (path: string, method: string, body: unknown) => {
        if (busy.current) return false;
        busy.current = true;
        setSaving(true);
        setError("");
        setEditError("");
        setNotice("");
        try {
            await memoRequest(path, { method, body });
            reload();
            return true;
        } catch (error) {
            if (editId) setEditError(errorMessage(error));
            else setError(errorMessage(error));
            return false;
        } finally {
            busy.current = false;
            setSaving(false);
        }
    };
    const saveNew = async (draft: MemoDraft) => {
        const saved = await mutate("/notes", "POST", {
            id: draft.id,
            content: draft.content,
            ...(draft.day !== todayKey() ? { createdDay: draft.day } : {}),
        });
        if (saved) {
            setDay(null);
            setQuery("");
            setTag("");
            setTrash(false);
            setNotice("已记录");
        }
        return saved;
    };
    return (
        <div className="app-shell">
            <div className="mote-layout">
                <aside className="mote-sidebar">
                    <a className="mote-brand" href="/">
                        mote<span>留住一闪而过</span>
                    </a>
                    <button
                        className="mote-nav"
                        data-active={!trash && !tag}
                        onClick={() => {
                            setTrash(false);
                            setTag("");
                            setDay(null);
                            setQuery("");
                        }}
                    >
                        全部记录 <span>{summary?.total || 0}</span>
                    </button>
                    <p className="mote-section-label">标签</p>
                    <div className="mote-tag-list">
                        {summary?.tags.map((item) => (
                            <button
                                key={item.name}
                                data-active={tag === item.name}
                                onClick={() => {
                                    setTag(item.name);
                                    setTrash(false);
                                    setDay(null);
                                }}
                            >
                                #{item.name}
                                <span>{item.count}</span>
                            </button>
                        ))}
                    </div>
                    <div className="mote-sidebar-bottom">
                        <button
                            onClick={() => {
                                setTrash(!trash);
                                setTag("");
                                setDay(null);
                                setQuery("");
                            }}
                        >
                            回收站
                        </button>
                        <button
                            onClick={() =>
                                window.dispatchEvent(new Event("mote-settings"))
                            }
                        >
                            设置与 Raycast
                        </button>
                    </div>
                </aside>
                <main className="mote-main">
                    <header className="mote-page-header">
                        <span>每一个想法，都值得留下。</span>
                        <button
                            className="text-button mote-mobile-settings"
                            onClick={() =>
                                window.dispatchEvent(new Event("mote-settings"))
                            }
                        >
                            设置
                        </button>
                    </header>
                    <div
                        className="memos-view"
                        role="tabpanel"
                        aria-label="Memos"
                    >
                        <div className="memo-tools">
                            <MemoMenu
                                label="记录菜单"
                                className="memo-all-menu"
                                trigger={
                                    <>
                                        {trash ? "回收站" : "All MEMOs"}
                                        <MemoGlyph name="chevron" />
                                    </>
                                }
                            >
                                <>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSort((value) =>
                                                value === "newest"
                                                    ? "oldest"
                                                    : "newest",
                                            );
                                        }}
                                    >
                                        <MemoGlyph name="sort" />
                                        <span>
                                            排序
                                            <small>
                                                创建时间，
                                                {sort === "newest"
                                                    ? "从新到旧"
                                                    : "从旧到新"}
                                            </small>
                                        </span>
                                    </button>
                                    <a href="/api/export" download>
                                        <DownloadIcon />
                                        <span>导出记录</span>
                                    </a>
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => {
                                            fileInput.current?.click();
                                        }}
                                    >
                                        <MemoGlyph name="upload" />
                                        <span>导入备份</span>
                                    </button>
                                    <div className="memo-menu-divider" />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTrash((value) => !value);
                                            setDay(null);
                                            setTag("");
                                            setQuery("");
                                        }}
                                    >
                                        <MemoGlyph
                                            name={trash ? "restore" : "trash"}
                                        />
                                        <span>
                                            {trash ? "全部记录" : "回收站"}
                                            <small>
                                                {trash
                                                    ? `全部年份`
                                                    : `${summary?.trash || 0} 条记录`}
                                            </small>
                                        </span>
                                    </button>
                                </>
                            </MemoMenu>
                            <div
                                ref={searchArea}
                                className="memo-search-area"
                                onBlur={(event) => {
                                    if (
                                        !event.currentTarget.contains(
                                            event.relatedTarget,
                                        )
                                    )
                                        setSearchOpen(false);
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === "Escape")
                                        setSearchOpen(false);
                                }}
                            >
                                <div
                                    className="memo-search"
                                    data-focused={searchOpen || undefined}
                                >
                                    <MemoGlyph name="search" />
                                    <input
                                        ref={searchInput}
                                        type="search"
                                        aria-label="搜索记录"
                                        placeholder="搜索 MEMOs"
                                        value={query}
                                        onFocus={() => setSearchOpen(true)}
                                        onChange={(event) =>
                                            setQuery(event.target.value)
                                        }
                                    />
                                    {query ? (
                                        <button
                                            type="button"
                                            className="memo-search-clear"
                                            aria-label="清除搜索"
                                            onClick={() => {
                                                setQuery("");
                                                searchInput.current?.focus();
                                                setSearchOpen(false);
                                            }}
                                        >
                                            <MemoGlyph name="close" />
                                        </button>
                                    ) : (
                                        <kbd>⌘ K</kbd>
                                    )}
                                    <MemoMenu
                                        label="筛选记录"
                                        className="memo-filter-menu"
                                        trigger={<MemoGlyph name="filter" />}
                                    >
                                        <>
                                            <label>
                                                标签
                                                <select
                                                    aria-label="标签筛选"
                                                    value={tag}
                                                    onChange={(event) => {
                                                        setTag(
                                                            event.target.value,
                                                        );
                                                        setSearchOpen(false);
                                                    }}
                                                >
                                                    <option value="">
                                                        全部标签
                                                    </option>
                                                    {summary?.tags.map(
                                                        (tag) => (
                                                            <option
                                                                key={tag.name}
                                                                value={tag.name}
                                                            >
                                                                #{tag.name} ·{" "}
                                                                {tag.count}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                            </label>
                                            <label>
                                                日期
                                                <input
                                                    aria-label="筛选日期"
                                                    type="date"
                                                    max={todayKey()}
                                                    value={day || ""}
                                                    onChange={(event) => {
                                                        const value =
                                                            event.target.value;
                                                        setDay(value || null);
                                                        setComposer(
                                                            (value) =>
                                                                value + 1,
                                                        );
                                                        setSearchOpen(false);
                                                    }}
                                                />
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setTag("");
                                                    setDay(null);
                                                    setSearchOpen(false);
                                                }}
                                            >
                                                清除筛选
                                            </button>
                                        </>
                                    </MemoMenu>
                                </div>
                                {searchOpen && !query && (
                                    <div className="memo-quick-search">
                                        <span>快捷搜索</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setDay(todayKey());
                                                setTag("");
                                                setTrash(false);

                                                setSearchOpen(false);
                                            }}
                                        >
                                            今天的记录
                                        </button>
                                    </div>
                                )}
                            </div>
                            <input
                                ref={fileInput}
                                className="sr-only"
                                type="file"
                                accept="application/json,.json"
                                aria-label="导入 Mote / Ripple 备份"
                                onChange={async (event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = "";
                                    if (!file) return;
                                    try {
                                        if (file.size > 32 * 1024 * 1024)
                                            throw new Error(
                                                "备份文件超过 32 MiB",
                                            );
                                        if (
                                            await mutate(
                                                "/import",
                                                "POST",
                                                JSON.parse(await file.text()),
                                            )
                                        )
                                            setNotice(
                                                "备份已导入，相同记录已跳过",
                                            );
                                    } catch (error) {
                                        setError(errorMessage(error));
                                    }
                                }}
                            />
                        </div>
                        {(query.trim() || tag || day) && (
                            <div className="memo-filter">
                                <span>
                                    {listedParams === params
                                        ? `MEMOs (${list.total})`
                                        : "搜索中…"}
                                    {tag && ` · #${tag}`}
                                    {day && ` · ${day}`}
                                </span>
                                <button
                                    type="button"
                                    className="text-button"
                                    onClick={() => {
                                        setDay(null);
                                        setTag("");
                                        setQuery("");
                                    }}
                                >
                                    清除筛选
                                </button>
                            </div>
                        )}
                        {trash && (
                            <p className="memo-filter">回收站 · 全部年份</p>
                        )}
                        {!trash && !query.trim() && (
                            <MemoComposer
                                key={composer}
                                day={day}
                                saving={saving}
                                onSave={saveNew}
                                onReset={() =>
                                    setComposer((value) => value + 1)
                                }
                                onDirty={setDirty}
                            />
                        )}
                        {error && (
                            <div className="memo-error" role="alert">
                                <span>{error}</span>
                                <button
                                    type="button"
                                    className="text-button"
                                    onClick={reload}
                                >
                                    重新读取
                                </button>
                            </div>
                        )}
                        {notice && (
                            <p className="memo-notice" role="status">
                                {notice}
                            </p>
                        )}
                        <section
                            className="memo-feed"
                            aria-label={trash ? "回收站" : "记录列表"}
                            aria-busy={loading || listedParams !== params}
                        >
                            {listedParams !== params && !error && (
                                <PixelLoader label="正在读取 Memos…" />
                            )}
                            {(listedParams === params ? list.notes : []).map(
                                (note) => (
                                    <article
                                        className="memo-note"
                                        key={note.id}
                                        data-id={note.id}
                                        onDoubleClick={(event) => {
                                            if (
                                                !trash &&
                                                !saving &&
                                                !(
                                                    event.target as Element
                                                ).closest(
                                                    "button, a, details, summary",
                                                )
                                            ) {
                                                setEditing(note);
                                                setEditId(note.id);
                                            }
                                        }}
                                        onContextMenu={(event) => {
                                            if (
                                                window
                                                    .getSelection()
                                                    ?.toString() ||
                                                (
                                                    event.target as Element
                                                ).closest("a, button, details")
                                            )
                                                return;
                                            event.preventDefault();
                                            document
                                                .querySelectorAll<HTMLDetailsElement>(
                                                    ".memo-note-menu[open]",
                                                )
                                                .forEach((menu) => {
                                                    menu.open = false;
                                                });
                                            const menu =
                                                event.currentTarget.querySelector<HTMLDetailsElement>(
                                                    ".memo-note-menu",
                                                );
                                            if (menu) menu.open = true;
                                        }}
                                    >
                                        <header>
                                            <time dateTime={note.createdAt}>
                                                {dateFormat.format(
                                                    new Date(note.createdAt),
                                                )}
                                            </time>
                                            <MemoMenu
                                                label="记录操作"
                                                className="memo-note-menu"
                                                trigger={
                                                    <MemoGlyph name="more" />
                                                }
                                            >
                                                {trash ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            disabled={saving}
                                                            onClick={async () => {
                                                                if (
                                                                    await mutate(
                                                                        `/notes/${note.id}`,
                                                                        "PATCH",
                                                                        {
                                                                            version:
                                                                                note.version,
                                                                            deleted: false,
                                                                        },
                                                                    )
                                                                )
                                                                    setNotice(
                                                                        "已恢复",
                                                                    );
                                                            }}
                                                        >
                                                            <MemoGlyph name="restore" />
                                                            恢复
                                                        </button>
                                                        <div className="memo-menu-divider" />
                                                        <div className="memo-menu-meta">
                                                            <span>
                                                                字数统计：
                                                                {memoWordCount(
                                                                    note.content,
                                                                )}
                                                            </span>
                                                            <span>
                                                                更新于{" "}
                                                                {updatedFormat.format(
                                                                    new Date(
                                                                        note.updatedAt,
                                                                    ),
                                                                )}
                                                            </span>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                try {
                                                                    await navigator.clipboard?.writeText(
                                                                        note.content,
                                                                    );
                                                                    setNotice(
                                                                        "已复制分享内容",
                                                                    );
                                                                } catch {
                                                                    setNotice(
                                                                        "复制失败",
                                                                    );
                                                                }
                                                            }}
                                                        >
                                                            <MemoGlyph name="share" />
                                                            分享
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={saving}
                                                            onClick={() => {
                                                                setEditing(
                                                                    note,
                                                                );
                                                                setEditId(
                                                                    note.id,
                                                                );
                                                            }}
                                                        >
                                                            <MemoGlyph name="edit" />
                                                            编辑
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                try {
                                                                    await navigator.clipboard?.writeText(
                                                                        note.content,
                                                                    );
                                                                    setNotice(
                                                                        "已复制",
                                                                    );
                                                                } catch {
                                                                    setNotice(
                                                                        "复制失败",
                                                                    );
                                                                }
                                                            }}
                                                        >
                                                            <MemoGlyph name="copy" />
                                                            复制
                                                        </button>
                                                        <div className="memo-menu-divider" />
                                                        <button
                                                            type="button"
                                                            className="memo-menu-plain"
                                                            onClick={() => {
                                                                if (
                                                                    note.tags[0]
                                                                ) {
                                                                    setTag(
                                                                        note
                                                                            .tags[0],
                                                                    );
                                                                    setDay(
                                                                        null,
                                                                    );
                                                                } else {
                                                                    setDay(
                                                                        note.day,
                                                                    );
                                                                    setTag("");
                                                                }
                                                            }}
                                                        >
                                                            相关 MEMOs
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="memo-menu-plain"
                                                            onClick={async () => {
                                                                try {
                                                                    await navigator.clipboard?.writeText(
                                                                        `${window.location.origin}/?day=${note.day}#${note.id}`,
                                                                    );
                                                                    setNotice(
                                                                        "已复制链接",
                                                                    );
                                                                } catch {
                                                                    setNotice(
                                                                        "复制失败",
                                                                    );
                                                                }
                                                            }}
                                                        >
                                                            复制链接
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="memo-menu-plain memo-menu-danger"
                                                            disabled={saving}
                                                            onClick={async () => {
                                                                if (
                                                                    await mutate(
                                                                        `/notes/${note.id}`,
                                                                        "PATCH",
                                                                        {
                                                                            version:
                                                                                note.version,
                                                                            deleted: true,
                                                                        },
                                                                    )
                                                                )
                                                                    setNotice(
                                                                        "已移到回收站",
                                                                    );
                                                            }}
                                                        >
                                                            移到回收站
                                                        </button>
                                                        <div className="memo-menu-divider" />
                                                        <div className="memo-menu-meta">
                                                            <span>
                                                                字数统计：
                                                                {memoWordCount(
                                                                    note.content,
                                                                )}
                                                            </span>
                                                            <span>
                                                                更新于{" "}
                                                                {updatedFormat.format(
                                                                    new Date(
                                                                        note.updatedAt,
                                                                    ),
                                                                )}
                                                            </span>
                                                        </div>
                                                    </>
                                                )}
                                            </MemoMenu>
                                        </header>
                                        <MemoText
                                            note={note}
                                            query={query}
                                            onTag={(value) => {
                                                setTag(value);
                                                setDay(null);
                                            }}
                                        />
                                    </article>
                                ),
                            )}
                            {!loading &&
                                listedParams === params &&
                                !list.notes.length && (
                                    <p className="journal-empty">
                                        {trash
                                            ? "回收站是空的"
                                            : query || tag || day
                                              ? "没有找到记录"
                                              : "写下一点，留给以后回看。"}
                                    </p>
                                )}
                            {listedParams === params && list.hasMore && (
                                <button
                                    type="button"
                                    className="text-button memo-more"
                                    disabled={loading}
                                    onClick={async () => {
                                        const current = generation.current;
                                        setLoading(true);
                                        try {
                                            const next =
                                                await memoRequest<MemoList>(
                                                    `/notes?${params}&offset=${list.notes.length}`,
                                                );
                                            if (current === generation.current)
                                                setList((old) => ({
                                                    ...next,
                                                    notes: [
                                                        ...old.notes,
                                                        ...next.notes,
                                                    ],
                                                }));
                                        } catch (error) {
                                            if (current === generation.current)
                                                setError(errorMessage(error));
                                        } finally {
                                            if (current === generation.current)
                                                setLoading(false);
                                        }
                                    }}
                                >
                                    加载更多
                                </button>
                            )}
                            {!loading &&
                                listedParams === params &&
                                !!list.notes.length &&
                                !list.hasMore && (
                                    <p className="memo-feed-end">
                                        All MEMOs loaded
                                    </p>
                                )}
                        </section>
                    </div>
                </main>
            </div>
            {editId && !editing && editError && (
                <div className="memo-open-error" role="alert">
                    {editError}
                    <button
                        type="button"
                        onClick={() => {
                            setEditId(null);
                            setEditError("");
                        }}
                    >
                        关闭
                    </button>
                </div>
            )}
            {editing && editId && (
                <MemoEditor
                    key={`${editId}:${editAttempt}`}
                    note={editing}
                    saving={saving}
                    error={editError}
                    onSave={(content) =>
                        mutate(`/notes/${editing.id}`, "PATCH", {
                            version: editing.version,
                            content,
                        })
                    }
                    onReload={() => {
                        setEditing(null);
                        setEditAttempt((value) => value + 1);
                    }}
                    onClose={() => {
                        setEditId(null);
                        setEditing(null);
                        setEditError("");
                    }}
                />
            )}
        </div>
    );
}
