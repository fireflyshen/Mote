import { todayKey } from "../../shared/date.ts";

export interface Memo {
  id: string;
  content: string;
  tags: string[];
  day: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}
export interface MemoList {
  notes: Memo[];
  total: number;
  hasMore: boolean;
}
export interface Summary {
  total: number;
  days: number;
  daily: Record<string, number>;
  tags: { name: string; count: number }[];
  trash: number;
}
export interface MemoDraft {
  id: string;
  content: string;
  day: string;
  version?: number;
}
export function extractTags(content: string): string[] {
  return [
    ...new Set(
      [...content.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)]
        .map((match) => match[1].replace(/\/+$/g, ""))
        .filter(Boolean),
    ),
  ];
}
export const newDraft = (): MemoDraft => ({
  id: crypto.randomUUID(),
  content: "",
  day: todayKey(),
});
