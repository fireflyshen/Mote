import { createContext, useContext, type ComponentProps } from "react";
import { Choices, type Choice } from "./Choices";
import { scrollToStart } from "../motion.ts";
import { PixelLoader } from "./PixelLoader";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { afterPaint, reducedMotion } from "../motion.ts";

interface DrawerShellProps {
  labelledBy: string;
  closeLabel: string;
  children: ReactNode;
  onClosed: () => void;
  size?: "default" | "compact";
  closeRequested?: boolean;
  onBeforeClose?: () => Promise<boolean>;
  busy?: boolean;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function DrawerShell({
  labelledBy,
  closeLabel,
  children,
  onClosed,
  size = "default",
  closeRequested = false,
  onBeforeClose,
  busy = false,
}: DrawerShellProps) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const dialog = useRef<HTMLElement | null>(null);
  const fallbackTimer = useRef<number | null>(null);
  const finished = useRef(false);
  const preparing = useRef(false);

  const finishClose = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onClosed();
  }, [onClosed]);

  const requestClose = useCallback(async () => {
    if (closing || finished.current || preparing.current || busy) return;
    preparing.current = true;
    try {
      if (onBeforeClose && !(await onBeforeClose())) return;
      setOpen(false);
      setClosing(true);
      if (reducedMotion()) finishClose();
      else fallbackTimer.current = window.setTimeout(finishClose, 420);
    } finally {
      preparing.current = false;
    }
  }, [closing, busy, onBeforeClose, finishClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    const cancelOpen = afterPaint(() => {
      setOpen(true);
      dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    });
    return () => {
      cancelOpen();
      if (fallbackTimer.current !== null)
        window.clearTimeout(fallbackTimer.current);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void requestClose();
      }
      if (event.key !== "Tab") return;
      const elements = [
        ...(dialog.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]',
        ) ?? []),
      ].filter(
        (element) =>
          !element.closest("[inert]") && element.getClientRects().length > 0,
      );
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) return;
      if (
        !dialog.current?.contains(document.activeElement) ||
        (event.shiftKey
          ? document.activeElement === first
          : document.activeElement === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  useEffect(() => {
    if (closeRequested) requestClose();
  }, [closeRequested, requestClose]);

  const state = open && !closing ? "open" : closing ? "closing" : "closed";
  return (
    <>
      <button
        className="drawer-scrim"
        data-state={state}
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={requestClose}
      />
      <aside
        ref={dialog}
        className={`day-drawer${size === "compact" ? " day-drawer--compact" : ""}`}
        data-state={state}
        aria-modal="true"
        role="dialog"
        aria-labelledby={labelledBy}
        aria-label={closeLabel.replace(/^关闭/, "")}
        onTransitionEnd={(event) => {
          if (
            event.target === event.currentTarget &&
            event.propertyName === "transform" &&
            closing
          )
            finishClose();
        }}
      >
        <header className="drawer-header">
          <button
            className="icon-button"
            type="button"
            onClick={requestClose}
            aria-label={closeLabel}
          >
            <CloseIcon />
          </button>
        </header>
        {children}
      </aside>
    </>
  );
}

const SectionContext = createContext<string | null>(null);
export function DrawerContent<T extends string>({
  sections,
  children,
  heading,
  inert = false,
  className = "",
}: {
  sections?: readonly Choice<T>[];
  children: ReactNode;
  heading?: ReactNode;
  inert?: boolean;
  className?: string;
}) {
  const [section, setSection] = useState<T | null>(
    sections?.[0]?.value ?? null,
  );
  const content = useRef<HTMLDivElement>(null);
  return (
    <SectionContext.Provider value={section}>
      <div
        className={`drawer-content ${className}`}
        ref={content}
        inert={inert}
        data-mobile-section={section ?? undefined}
      >
        {heading}
        {sections && section !== null && (
          <Choices
            variant="mobile"
            label="日期内容"
            value={section}
            options={sections}
            onChange={(value) => {
              setSection(value);
              window.requestAnimationFrame(() =>
                scrollToStart(content.current),
              );
            }}
          />
        )}
        {children}
      </div>
    </SectionContext.Provider>
  );
}
export function DrawerSection({
  name,
  ...props
}: ComponentProps<"section"> & { name: string }) {
  const section = useContext(SectionContext);
  return (
    <section {...props} data-active={section === null || section === name} />
  );
}
export function DrawerHeading({
  id,
  title,
  eyebrow,
  meta,
  className = "",
}: {
  id: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`page-heading ${className}`}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2 id={id}>{title}</h2>
      {meta && <div className="page-meta">{meta}</div>}
    </div>
  );
}
export function DrawerState({
  loading,
  error,
  label = "正在读取这一天…",
}: {
  loading: boolean;
  error: string | null;
  label?: string;
}) {
  return (
    <div className="drawer-loading" role="status">
      {error && !loading ? (
        <span className="save-error">{error}</span>
      ) : (
        <PixelLoader label={label} />
      )}
    </div>
  );
}

export function DrawerSaveState({
  saving,
  error,
  onReload,
}: {
  saving: boolean;
  error: string | null;
  onReload: () => void;
}) {
  if (!saving && !error) return null;
  return (
    <div className="drawer-save-state" role={saving ? "status" : "alert"}>
      {saving ? (
        <PixelLoader label="正在保存…" inline />
      ) : (
        <>
          <span className="save-error">{error}</span>
          <button
            className="drawer-state-action"
            type="button"
            onClick={onReload}
          >
            放弃修改并重新载入
          </button>
        </>
      )}
    </div>
  );
}

export function DrawerSectionHeading({
  id,
  title,
  detail,
  className = "",
}: {
  id?: string;
  title: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`drawer-section-heading ${className}`}>
      <h3 id={id}>{title}</h3>
      {detail}
    </div>
  );
}
