import { useEffect, useRef, type ReactNode } from "react";

export function MemoGlyph({
  name,
}: {
  name:
    | "search"
    | "filter"
    | "chevron"
    | "more"
    | "send"
    | "tag"
    | "list"
    | "ordered"
    | "calendar"
    | "close"
    | "sort"
    | "trash"
    | "edit"
    | "copy"
    | "share"
    | "upload"
    | "restore";
}) {
  const paths = {
    search: "m20 20-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
    filter: "M3 5h18M6 12h12M10 19h4",
    chevron: "m6 9 6 6 6-6",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    send: "M3 3.5v6.6L15 12 3 13.9v6.6L22 12 3 3.5Z",
    tag: "M10 3 6 21M18 3l-4 18M4 8h17M2 16h17",
    list: "M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01",
    ordered:
      "M10 6h11M10 12h11M10 18h11M3 3h1v6M2 12c0-3 5-3 4 0l-4 4h4M2 19h3l-2 2h2",
    calendar:
      "M8 2v4M16 2v4M3 10h18M8 15h3M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
    close: "m6 6 12 12M6 18 18 6",
    sort: "M7 20V4m-4 4 4-4 4 4M17 4v16m-4-4 4 4 4-4",
    trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
    edit: "m4 16 12-12 4 4L8 20H4v-4Zm10-10 4 4",
    copy: "M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2ZM5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1",
    share: "M12 3v12m-4-8 4-4 4 4M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5",
    upload: "M12 16V3m-4 4 4-4 4 4M4 16v5h16v-5",
    restore: "M3 10a9 9 0 1 1 1 8M3 3v7h7M12 7v6l4 2",
  };
  return (
    <svg
      className={`memo-glyph-${name}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 2.8 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}

// Native disclosure keeps the trigger keyboard accessible; menus also close outside or on Escape.
export function MemoMenu({
  label,
  trigger,
  children,
  className = "",
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const element = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (element.current) element.current.open = false;
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!element.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <details
      ref={element}
      className={`memo-menu ${className}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
          element.current?.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={label} title={label}>
        {trigger}
      </summary>
      <div
        className="memo-menu-panel"
        onClick={(event) => {
          if ((event.target as Element).closest("button, a")) close();
        }}
      >
        {children}
      </div>
    </details>
  );
}
