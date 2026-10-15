import { parseBody, type Body, type Parsed } from "@/lib/job-input";

// Career growth after the hire: people around a job (with manager history), 1:1s,
// performance reviews and goals. Pure helpers: request parsing, checklist JSON and the
// derived current manager. DB access lives in src/lib/services/career-growth.ts.

export const PERSON_RELATIONSHIPS = ["manager", "skip", "peer", "report", "mentor", "stakeholder"] as const;
export const GOAL_STATUSES = ["active", "done", "dropped"] as const;

export type ChecklistItem = { text: string; done: boolean };

// Action items / key results are stored as a JSON `{ text, done }[]`; anything malformed
// reads as empty and blank items are dropped.
export function parseChecklist(raw: string | null | undefined): ChecklistItem[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? normalizeChecklist(v) : [];
  } catch {
    return [];
  }
}

function normalizeChecklist(list: unknown[]): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  for (const item of list) {
    const text =
      typeof item === "string"
        ? item
        : item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string"
          ? (item as { text: string }).text
          : "";
    if (!text.trim()) continue;
    out.push({ text: text.trim(), done: typeof item === "object" && (item as { done?: unknown }).done === true });
  }
  return out;
}

// Normalize a checklist request field (array of items/strings, or newline-separated text)
// to stored JSON. undefined = not present in the body.
export function checklistField(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : [];
  return JSON.stringify(normalizeChecklist(list));
}

export function personInput(body: Body, opts: { create?: boolean } = {}): Parsed {
  return parseBody(
    body,
    {
      required: ["name"],
      enums: { relationship: PERSON_RELATIONSHIPS },
      text: ["title", "email", "notes"],
      dates: ["startDate", "endDate"],
    },
    !!opts.create,
  );
}

export function oneOnOneInput(body: Body): Parsed {
  const r = parseBody(body, { dates: ["date"], ints: ["personId"] }, false);
  if (r.error) return r;
  if (body.notes !== undefined) r.values.notes = typeof body.notes === "string" ? body.notes : "";
  const items = checklistField(body.actionItems);
  if (items !== undefined) r.values.actionItems = items;
  return r;
}

export function reviewInput(body: Body, opts: { create?: boolean } = {}): Parsed {
  return parseBody(
    body,
    {
      required: ["cycle"],
      dates: ["periodStart", "periodEnd"],
      ints: ["compensationId"],
      text: ["rating", "reviewer", "summary", "strengths", "growthAreas", "outcome"],
    },
    !!opts.create,
  );
}

export function goalInput(body: Body, opts: { create?: boolean } = {}): Parsed {
  const r = parseBody(
    body,
    {
      required: ["title"],
      text: ["description", "period"],
      enums: { status: GOAL_STATUSES },
      ints: ["progress"],
    },
    !!opts.create,
  );
  if (r.error) return r;
  const p = r.values.progress;
  if (p !== undefined && p !== null && ((p as number) < 0 || (p as number) > 100)) {
    return { values: r.values, error: "progress must be between 0 and 100" };
  }
  if (p === null) delete r.values.progress; // column is NOT NULL; blank means "leave as is"
  if (r.values.status === "done" && r.values.progress === undefined) r.values.progress = 100;
  const krs = checklistField(body.keyResults);
  if (krs !== undefined) r.values.keyResults = krs;
  return r;
}

type PersonLike = {
  id: number;
  name: string;
  relationship: string;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
};

// Manager history: the manager rows in date order (undated first).
export function managerHistory<T extends PersonLike>(people: T[]): T[] {
  return people
    .filter((p) => p.relationship === "manager")
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? "") || a.id - b.id);
}

// The manager as of `today`: the latest-starting manager row whose date range covers today
// (open ends count), else the free-text `jobs.manager` kept for older records.
export function currentManager(people: PersonLike[], fallback: string | null, today: string): string | null {
  const active = managerHistory(people).filter(
    (p) => (!p.startDate || p.startDate <= today) && (!p.endDate || p.endDate >= today),
  );
  return active.length ? active[active.length - 1].name : fallback;
}
