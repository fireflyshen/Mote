import { useRef, useState, type SetStateAction } from "react";
import { clearDraft, readDraft, writeDraft } from "./drafts.ts";

// A draft belongs to one date/settings form and remembers the server value it edited.
export function useLocalDraft<T>(key: string, base: string, initial: () => T) {
  const [restored] = useState(() => readDraft<T>(key));
  const [value, setValue] = useState(() => restored?.value ?? initial());
  const current = useRef(value);
  const baseRef = useRef(restored?.base ?? base);
  const [dirty, setDirty] = useState(!!restored);
  const [conflict, setConflict] = useState(
    !!restored && restored.base !== base,
  );
  const [localError, setLocalError] = useState(false);
  const update = (action: SetStateAction<T>) => {
    const next =
      typeof action === "function"
        ? (action as (value: T) => T)(current.current)
        : action;
    current.current = next;
    setLocalError(!writeDraft(key, baseRef.current, next));
    setValue(next);
    setDirty(true);
  };
  const accept = () => {
    baseRef.current = base;
    setConflict(false);
    setLocalError(!writeDraft(key, base, current.current));
  };
  const clear = () => {
    clearDraft(key);
    setDirty(false);
  };
  return {
    value,
    update,
    dirty,
    conflict,
    accept,
    clear,
    restored: !!restored,
    localError,
  };
}
