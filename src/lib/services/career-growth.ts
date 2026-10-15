import { db, schema } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import type { Body, Parsed } from "@/lib/job-input";
import { getOwnedJob, todayISO } from "@/lib/jobs";
import {
  GOAL_STATUSES,
  PERSON_RELATIONSHIPS,
  goalInput,
  oneOnOneInput,
  parseChecklist,
  personInput,
  reviewInput,
} from "@/lib/career-growth";
import { buildBragDoc, bragDocMarkdown, type BragDoc } from "@/lib/brag-doc";
import { draftSelfReview } from "@/lib/llm";
import { NotFoundError, ValidationError } from "./errors";

// Career growth for a job the user holds: people, 1:1s, performance reviews and goals.
// Every query is scoped by userId AND jobId, and the job must be owned (else NotFoundError),
// so a row id from another user — or from another of the caller's jobs — is never touched.

export type GrowthKind = "people" | "oneOnOnes" | "reviews" | "goals";

type Person = typeof schema.jobPeople.$inferSelect;
type OneOnOne = typeof schema.oneOnOnes.$inferSelect;
type Review = typeof schema.performanceReviews.$inferSelect;
type Goal = typeof schema.goals.$inferSelect;

const rank = (list: readonly string[], v: string) => {
  const i = list.indexOf(v);
  return i === -1 ? list.length : i;
};

// Per-kind table, parser, list order and API shape.
const KINDS = {
  people: {
    table: schema.jobPeople,
    parse: (b: Body, create: boolean) => personInput(b, { create }),
    sort: (a: Person, b: Person) =>
      rank(PERSON_RELATIONSHIPS, a.relationship) - rank(PERSON_RELATIONSHIPS, b.relationship) || a.id - b.id,
    serialize: (r: Person) => r,
  },
  oneOnOnes: {
    table: schema.oneOnOnes,
    parse: (b: Body) => oneOnOneInput(b),
    sort: (a: OneOnOne, b: OneOnOne) => (b.date ?? "").localeCompare(a.date ?? "") || b.id - a.id,
    serialize: (r: OneOnOne) => ({ ...r, actionItems: parseChecklist(r.actionItems) }),
  },
  reviews: {
    table: schema.performanceReviews,
    parse: (b: Body, create: boolean) => reviewInput(b, { create }),
    sort: (a: Review, b: Review) =>
      (b.periodEnd ?? b.periodStart ?? "").localeCompare(a.periodEnd ?? a.periodStart ?? "") || b.id - a.id,
    serialize: (r: Review) => r,
  },
  goals: {
    table: schema.goals,
    parse: (b: Body, create: boolean) => goalInput(b, { create }),
    sort: (a: Goal, b: Goal) => rank(GOAL_STATUSES, a.status) - rank(GOAL_STATUSES, b.status) || b.id - a.id,
    serialize: (r: Goal) => ({ ...r, keyResults: parseChecklist(r.keyResults) }),
  },
} as const;

// The four tables share id/userId/jobId; typing the generic paths against one of them keeps
// Drizzle's inference simple without `any`.
type Table = typeof schema.goals;
const tableOf = (kind: GrowthKind) => KINDS[kind].table as unknown as Table;

async function ownedJob(userId: string, jobId: number) {
  const job = await getOwnedJob(userId, jobId);
  if (!job) throw new NotFoundError();
  return job;
}

function parse(kind: GrowthKind, body: Body, create: boolean): Record<string, unknown> {
  const { values, error } = (KINDS[kind].parse as (b: Body, c: boolean) => Parsed)(body, create);
  if (error) throw new ValidationError(error);
  return values;
}

// A 1:1's person and a review's comp row must belong to the same user and job.
async function checkLinks(userId: string, jobId: number, values: Record<string, unknown>) {
  const links: [string, typeof schema.jobPeople | typeof schema.jobCompensation][] = [
    ["personId", schema.jobPeople],
    ["compensationId", schema.jobCompensation],
  ];
  for (const [key, table] of links) {
    const id = values[key];
    if (id == null) continue;
    const [row] = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, id as number), eq(table.userId, userId), eq(table.jobId, jobId)))
      .limit(1);
    if (!row) throw new ValidationError(`${key} not found for this job`);
  }
}

export async function listItems(kind: GrowthKind, userId: string, jobId: number): Promise<unknown[]> {
  const job = await ownedJob(userId, jobId);
  const t = tableOf(kind);
  const rows = await db.select().from(t).where(and(eq(t.userId, userId), eq(t.jobId, job.id)));
  const k = KINDS[kind] as unknown as { sort: (a: unknown, b: unknown) => number; serialize: (r: unknown) => unknown };
  return [...rows].sort(k.sort).map(k.serialize);
}

export async function createItem(kind: GrowthKind, userId: string, jobId: number, body: Body): Promise<{ id: number }> {
  const job = await ownedJob(userId, jobId);
  const values = parse(kind, body, true);
  await checkLinks(userId, job.id, values);
  if (kind === "oneOnOnes" && !values.date) values.date = todayISO();
  const t = tableOf(kind);
  const [row] = await db
    .insert(t)
    .values({ ...(values as { title: string }), userId, jobId: job.id })
    .returning({ id: t.id });
  return { id: row.id };
}

export async function updateItem(kind: GrowthKind, userId: string, jobId: number, id: number, body: Body): Promise<void> {
  const job = await ownedJob(userId, jobId);
  const values = parse(kind, body, false);
  await checkLinks(userId, job.id, values);
  const t = tableOf(kind);
  const updated = await db
    .update(t)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(t.id, id), eq(t.userId, userId), eq(t.jobId, job.id)))
    .returning({ id: t.id });
  if (updated.length === 0) throw new NotFoundError();
}

export async function deleteItem(kind: GrowthKind, userId: string, jobId: number, id: number): Promise<void> {
  const job = await ownedJob(userId, jobId);
  const t = tableOf(kind);
  const deleted = await db
    .delete(t)
    .where(and(eq(t.id, id), eq(t.userId, userId), eq(t.jobId, job.id)))
    .returning({ id: t.id });
  if (deleted.length === 0) throw new NotFoundError();
}

// --- Brag doc + self-review ---

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export type BragRange = { from?: string; to?: string };

// Load only the brag-doc-safe columns: achievement/feedback journal entries, goals, and
// reviews without `outcome` / `compensationId`. Private data is never even selected.
export async function getBragDoc(
  userId: string,
  jobId: number,
  range: BragRange = {},
): Promise<{ doc: BragDoc; markdown: string }> {
  for (const [k, v] of Object.entries(range)) {
    if (v && !ISO_DATE.test(v)) throw new ValidationError(`${k} must be YYYY-MM-DD`);
  }
  const job = await ownedJob(userId, jobId);
  const [entries, goals, reviews] = await Promise.all([
    db
      .select({
        kind: schema.journalEntries.kind,
        title: schema.journalEntries.title,
        body: schema.journalEntries.body,
        impact: schema.journalEntries.impact,
        technologies: schema.journalEntries.technologies,
        entryDate: schema.journalEntries.entryDate,
      })
      .from(schema.journalEntries)
      .where(
        and(
          eq(schema.journalEntries.userId, userId),
          eq(schema.journalEntries.jobId, job.id),
          inArray(schema.journalEntries.kind, ["achievement", "feedback"]),
        ),
      ),
    db
      .select({
        title: schema.goals.title,
        description: schema.goals.description,
        period: schema.goals.period,
        status: schema.goals.status,
        progress: schema.goals.progress,
        keyResults: schema.goals.keyResults,
      })
      .from(schema.goals)
      .where(and(eq(schema.goals.userId, userId), eq(schema.goals.jobId, job.id))),
    db
      .select({
        cycle: schema.performanceReviews.cycle,
        periodStart: schema.performanceReviews.periodStart,
        periodEnd: schema.performanceReviews.periodEnd,
        rating: schema.performanceReviews.rating,
        reviewer: schema.performanceReviews.reviewer,
        summary: schema.performanceReviews.summary,
        strengths: schema.performanceReviews.strengths,
        growthAreas: schema.performanceReviews.growthAreas,
      })
      .from(schema.performanceReviews)
      .where(and(eq(schema.performanceReviews.userId, userId), eq(schema.performanceReviews.jobId, job.id))),
  ]);
  const doc = buildBragDoc({
    job: { company: job.company, title: job.title, technologies: job.technologies },
    entries,
    goals,
    reviews,
    from: range.from || undefined,
    to: range.to || undefined,
  });
  return { doc, markdown: bragDocMarkdown(doc) };
}

// Draft a self-review from the brag doc (and nothing else). 400 when there is nothing to
// draft from, so the model is never asked to write from an empty doc.
export async function draftJobSelfReview(
  userId: string,
  jobId: number,
  opts: BragRange & { cycle?: string },
): Promise<{ draft: string; bragDoc: string }> {
  const { doc, markdown } = await getBragDoc(userId, jobId, { from: opts.from, to: opts.to });
  if (!doc.achievements.length && !doc.feedback.length && !doc.goalsCompleted.length) {
    throw new ValidationError("Nothing in the brag doc to draft from — add achievements, feedback or goals first");
  }
  const draft = await draftSelfReview({ userId, bragDoc: markdown, cycle: opts.cycle?.trim() || undefined });
  return { draft, bragDoc: markdown };
}
