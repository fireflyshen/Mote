export interface LocalDraft<T> {
    base: string;
    value: T;
    updatedAt: number;
}
const prefix = "tessera:draft:";
function storage() {
    try {
        return globalThis.localStorage;
    } catch {
        return undefined;
    }
}
export function readDraft<T>(key: string): LocalDraft<T> | null {
    try {
        const raw = storage()?.getItem(prefix + key);
        if (!raw) return null;
        const draft = JSON.parse(raw) as LocalDraft<T>;
        return typeof draft.base === "string" &&
            typeof draft.updatedAt === "number" &&
            draft.value != null
            ? draft
            : null;
    } catch {
        return null;
    }
}
export function writeDraft<T>(key: string, base: string, value: T) {
    try {
        const target = storage();
        if (!target) return false;
        target.setItem(
            prefix + key,
            JSON.stringify({ base, value, updatedAt: Date.now() }),
        );
        return true;
    } catch {
        return false;
    }
}
export function clearDraft(key: string) {
    try {
        storage()?.removeItem(prefix + key);
    } catch {
        /* Keep a recoverable copy when storage is unavailable. */
    }
}
export function latestDraft(scope: string) {
    const target = storage();
    if (!target) return null;
    let result: { key: string; updatedAt: number } | null = null;
    try {
        for (let i = 0; i < target.length; i++) {
            const key = target.key(i);
            if (!key?.startsWith(prefix + scope)) continue;
            const relative = key.slice(prefix.length);
            const draft = readDraft(relative);
            if (draft && (!result || draft.updatedAt > result.updatedAt))
                result = { key: relative, updatedAt: draft.updatedAt };
        }
    } catch {
        return null;
    }
    return result?.key.slice(scope.length) ?? null;
}
