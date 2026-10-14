import { db, schema } from "@/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { normalizeCompany } from "@/lib/dedup";

// Employment-history helpers: mapping a won application to a job, comp-timeline maths,
// and technology-list handling. Pure functions first; DB writers at the bottom.

export const JOB_COMP_KINDS = ["start", "raise", "promotion", "adjustment", "bonus_payout", "equity_grant"] as const;
export const JOURNAL_KINDS = ["achievement", "feedback", "complaint", "note"] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];

// Technologies are stored as a JSON string[]; anything malformed reads as empty.
export function parseTechList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  } catch {
    return [];
  }
}

// Union of technology lists, case-insensitive, keeping the first spelling seen.
export function mergeTechnologies(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const t = raw.trim();
      const key = t.toLowerCase();
      if (!t || seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

// Normalize a technologies request field (array or comma-separated string) to stored JSON.
export function techField(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  const list = Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : typeof v === "string"
      ? v.split(",")
      : [];
  return JSON.stringify(mergeTechnologies(list));
}

type AppLike = {
  company: string;
  roleTitle: string;
  employmentType?: string | null;
  locationMode?: string | null;
  location?: string | null;
  payMin?: number | null;
  payMax?: number | null;
  payCurrency?: string | null;
  payPeriod?: string | null;
  bonus?: string | null;
  benefits?: string | null;
  techStack?: string | null;
};

// Map a won application onto a new job, its starting comp row, and its benefits seed.
export function jobFromApplication(app: AppLike, today: string) {
  const job = {
    company: app.company,
    companyNormalized: normalizeCompany(app.company),
    title: app.roleTitle,
    startDate: today,
    employmentType: app.employmentType ?? null,
    locationMode: app.locationMode ?? null,
    location: app.location ?? null,
    technologies: JSON.stringify(mergeTechnologies((app.techStack ?? "").split(","))),
  };
  const baseAmount = app.payMax ?? app.payMin ?? null;
  const comp =
    baseAmount != null
      ? {
          kind: "start",
          effectiveDate: today,
          title: app.roleTitle,
          baseAmount,
          currency: app.payCurrency || "USD",
          period: app.payPeriod || "year",
          bonus: app.bonus ?? null,
        }
      : null;
  const benefits = app.benefits?.trim() ? { other: app.benefits } : null;
  return { job, comp, benefits };
}

type CompRow = {
  id: number;
  effectiveDate: string | null;
  kind: string;
  baseAmount: number | null;
  currency: string;
  period: string;
  title: string | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

// Comp timeline in date order, with % change between successive base-pay rows.
export function compSummary(rows: CompRow[]) {
  const sorted = [...rows].sort(
    (a, b) => (a.effectiveDate ?? "").localeCompare(b.effectiveDate ?? "") || a.id - b.id,
  );
  let prev: number | null = null;
  let first: number | null = null;
  let current: { baseAmount: number; currency: string; period: string } | null = null;
  const titles: string[] = [];
  const steps = sorted.map((r) => {
    let changePct: number | null = null;
    if (r.baseAmount != null) {
      if (prev != null && prev > 0) changePct = round1((r.baseAmount / prev - 1) * 100);
      if (first == null) first = r.baseAmount;
      prev = r.baseAmount;
      current = { baseAmount: r.baseAmount, currency: r.currency, period: r.period };
    }
    if (r.title && !titles.includes(r.title)) titles.push(r.title);
    return { ...r, changePct };
  });
  const last = current as { baseAmount: number } | null;
  const totalGrowthPct =
    first != null && first > 0 && last ? round1((last.baseAmount / first - 1) * 100) : null;
  return { steps, current, totalGrowthPct, titles };
}

// Whole months between two YYYY-MM-DD dates; open-ended jobs count to `today`.
export function tenureMonths(start: string | null, end: string | null, today: string): number | null {
  if (!start) return null;
  const [y1, m1, d1] = start.split("-").map(Number);
  const [y2, m2, d2] = (end ?? today).split("-").map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

// Create (once) the job for a won application. Returns the job id, existing or new.
export async function createJobFromApplication(
  userId: string,
  app: AppLike & { id: number },
  today: string = todayISO(),
): Promise<number | null> {
  const { job, comp, benefits } = jobFromApplication(app, today);
  const [created] = await db
    .insert(schema.jobs)
    .values({ userId, applicationId: app.id, ...job })
    .onConflictDoNothing()
    .returning({ id: schema.jobs.id });
  if (!created) {
    const [existing] = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.userId, userId), eq(schema.jobs.applicationId, app.id)))
      .limit(1);
    return existing?.id ?? null;
  }
  if (comp) await db.insert(schema.jobCompensation).values({ userId, jobId: created.id, ...comp });
  if (benefits) await db.insert(schema.jobBenefits).values({ userId, jobId: created.id, ...benefits });
  return created.id;
}

// Load a job only if it belongs to the user.
export async function getOwnedJob(userId: string, jobId: number) {
  if (!Number.isFinite(jobId)) return null;
  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.userId, userId)))
    .limit(1);
  return job ?? null;
}

// API shape: technologies as a real array instead of stored JSON text.
export function serializeTech<T extends { technologies: string }>(row: T) {
  return { ...row, technologies: parseTechList(row.technologies) };
}

// Current jobs (no endDate) first, then most recent start first.
export function sortJobs<T extends { endDate: string | null; startDate: string | null; id: number }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(a.endDate != null) - Number(b.endDate != null) ||
      (b.startDate ?? "").localeCompare(a.startDate ?? "") ||
      b.id - a.id,
  );
}

// Identity used to skip re-importing a job that is already tracked.
export function jobKey(j: { company: string; title: string; startDate: string | null }): string {
  return `${normalizeCompany(j.company)}|${j.startDate ?? ""}|${j.title.trim().toLowerCase()}`;
}

type JobIdentity = { company: string; title: string; startDate: string | null };

// How an import candidate relates to jobs already tracked: "exact" (same company, start
// date and title), "possible" (same company, different dates/title), or null.
export function matchExisting(candidate: JobIdentity, existing: JobIdentity[]): "exact" | "possible" | null {
  const key = jobKey(candidate);
  if (existing.some((e) => jobKey(e) === key)) return "exact";
  const company = normalizeCompany(candidate.company);
  return existing.some((e) => normalizeCompany(e.company) === company) ? "possible" : null;
}

// Date (YYYY-MM-DD) an application was won: its latest status change into closed_won,
// else `fallback` (used when backfilling jobs for applications won before jobs existed).
export function wonDateFrom(
  events: { type: string; detail: string | null; createdAt: Date }[],
  fallback: Date,
): string {
  const won = events
    .filter((e) => e.type === "status_change" && e.detail?.endsWith("→ closed_won"))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return (won?.createdAt ?? fallback).toISOString().slice(0, 10);
}

// The user's closed_won applications that have no job yet (e.g. won before job tracking
// existed), each with the date it was won.
export async function unlinkedWonApplications(userId: string) {
  const apps = (
    await db
      .select({ app: schema.applications })
      .from(schema.applications)
      .leftJoin(
        schema.jobs,
        and(eq(schema.jobs.applicationId, schema.applications.id), eq(schema.jobs.userId, userId)),
      )
      .where(
        and(
          eq(schema.applications.userId, userId),
          eq(schema.applications.status, "closed_won"),
          isNull(schema.jobs.id),
        ),
      )
  ).map((r) => r.app);
  if (apps.length === 0) return [];
  const events = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.userId, userId), inArray(schema.events.applicationId, apps.map((a) => a.id))));
  return apps.map((app) => ({
    app,
    wonDate: wonDateFrom(events.filter((e) => e.applicationId === app.id), app.updatedAt),
  }));
}
