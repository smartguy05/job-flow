// Pure helpers for the interview-question checklist (no db imports).

export type QuestionRow = {
  id: number;
  text: string;
  sortOrder: number;
  applicationId: number | null;
};

export type QuestionStateRow = {
  questionId: number;
  checkedAt: Date | null;
  notes: string;
};

export type ChecklistItem = {
  id: number;
  text: string;
  source: "general" | "job";
  checked: boolean;
  checkedAt: string | null;
  notes: string;
};

const MAX_LEN = 1000;

const bySort = (a: QuestionRow, b: QuestionRow) => a.sortOrder - b.sortOrder || a.id - b.id;

/** Unchecked first (general, then job; each by sortOrder, id), then checked by checkedAt asc. */
export function buildChecklist(
  general: QuestionRow[],
  specific: QuestionRow[],
  states: QuestionStateRow[],
): ChecklistItem[] {
  const byQ = new Map(states.map((s) => [s.questionId, s]));
  const toItem = (r: QuestionRow, source: "general" | "job"): ChecklistItem => {
    const s = byQ.get(r.id);
    const at = s?.checkedAt ?? null;
    return {
      id: r.id,
      text: r.text,
      source,
      checked: at !== null,
      checkedAt: at ? at.toISOString() : null,
      notes: s?.notes ?? "",
    };
  };
  const items = [
    ...[...general].sort(bySort).map((r) => toItem(r, "general")),
    ...[...specific].sort(bySort).map((r) => toItem(r, "job")),
  ];
  const unchecked = items.filter((i) => !i.checked);
  const checked = items
    .filter((i) => i.checked)
    .sort((a, b) => Date.parse(a.checkedAt!) - Date.parse(b.checkedAt!) || a.id - b.id);
  return [...unchecked, ...checked];
}

export function normalizeQuestion(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const t = text.trim();
  if (!t || t.length > MAX_LEN) return null;
  return t;
}

export function dedupeImports(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((e) => e.trim().toLowerCase()));
  const out: string[] = [];
  for (const raw of incoming) {
    const n = normalizeQuestion(raw);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}
