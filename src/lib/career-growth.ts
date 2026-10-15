import { parseBody, type Body, type Parsed } from "@/lib/job-input";
import { EQUITY_TYPES, VEST_FREQUENCIES } from "@/lib/vesting";
import { PTO_KINDS, businessDays } from "@/lib/pto";

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

// --- Equity grants and PTO (post-hire, part 2) ---

const nonNegative = (r: Parsed, keys: string[]): Parsed => {
  for (const k of keys) {
    const v = r.values[k];
    if (typeof v === "number" && v < 0) return { values: r.values, error: `${k} must be 0 or more` };
  }
  return r;
};

export function equityInput(body: Body, opts: { create?: boolean } = {}): Parsed {
  const r = parseBody(
    body,
    {
      enums: { type: EQUITY_TYPES, frequency: VEST_FREQUENCIES },
      dates: ["grantDate", "vestStart"],
      ints: ["shares", "cliffMonths", "vestMonths"],
      nums: ["strikePrice"],
      text: ["notes"],
    },
    false,
  );
  if (r.error) return r;
  if (opts.create && body.shares === undefined) return { values: r.values, error: "shares required" };
  if ("shares" in r.values && !((r.values.shares as number | null) && (r.values.shares as number) > 0)) {
    return { values: r.values, error: "shares must be greater than 0" };
  }
  // NOT NULL columns with defaults: blank means "leave as is" (or the default on create).
  for (const k of ["cliffMonths", "vestMonths"]) if (r.values[k] === null) delete r.values[k];
  return nonNegative(r, ["cliffMonths", "vestMonths", "strikePrice"]);
}

type GrantMonths = { cliffMonths: number; vestMonths: number };
const GRANT_DEFAULTS: GrantMonths = { cliffMonths: 12, vestMonths: 48 };

// Cross-field check on the row as it will be stored (new values over the existing row, or
// over the column defaults on create).
export function finalizeGrant(values: Record<string, unknown>, existing: GrantMonths | null): Parsed {
  const merged = { ...(existing ?? GRANT_DEFAULTS), ...values } as GrantMonths;
  if (merged.cliffMonths > merged.vestMonths) return { values, error: "cliffMonths can't exceed vestMonths" };
  return { values };
}

export function ptoInput(body: Body, opts: { create?: boolean } = {}): Parsed {
  const r = parseBody(
    body,
    { dates: ["startDate", "endDate"], enums: { kind: PTO_KINDS }, nums: ["days"], text: ["note"] },
    false,
  );
  if (r.error) return r;
  if ((opts.create || body.startDate !== undefined) && !r.values.startDate) return { values: r.values, error: "startDate required" };
  if (r.values.days === null) delete r.values.days;
  return nonNegative(r, ["days"]);
}

type PtoRange = { startDate: string; endDate: string; days: number };

// Fill derived fields: endDate defaults to startDate; days default to the weekdays in the
// range, recomputed when the range changes and no explicit days were sent.
export function finalizePto(values: Record<string, unknown>, existing: PtoRange | null): Parsed {
  const out = { ...values };
  if (!existing && !out.endDate) out.endDate = out.startDate;
  if (out.endDate === null && existing) out.endDate = (out.startDate as string | undefined) ?? existing.startDate;
  const start = (out.startDate as string | undefined) ?? existing?.startDate;
  const end = (out.endDate as string | undefined) ?? existing?.endDate;
  if (start && end && end < start) return { values, error: "endDate can't be before startDate" };
  const rangeChanged = !existing || out.startDate !== undefined || out.endDate !== undefined;
  if (out.days === undefined && rangeChanged && start && end) out.days = businessDays(start, end);
  return { values: out };
}
