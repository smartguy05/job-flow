import { db, schema } from "@/db";
import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";

// Statuses still considered "open" for reminders (mirrors the expiry sweep).
export const OPEN_STATUSES = ["applied", "in_progress"];
const DAY = 24 * 60 * 60 * 1000;

export type Candidate = {
  id: number;
  userId: string;
  company: string;
  roleTitle: string;
  status: string;
  reason: "quiet" | "next_action_due";
  daysQuiet: number;
  nextAction: string | null;
};

// Applications belonging to one user that need attention: quiet past their window (and not
// reminded within it) OR with a due next action. De-duplicated by id; quiet takes
// precedence in the label.
export async function candidatesForUser(userId: string, quietDays: number): Promise<Candidate[]> {
  const now = Date.now();
  const cutoff = new Date(now - quietDays * DAY);

  const quiet = (
    await db
      .select()
      .from(schema.applications)
      .where(
        and(
          eq(schema.applications.userId, userId),
          inArray(schema.applications.status, OPEN_STATUSES),
          lt(schema.applications.lastActivityAt, cutoff),
        ),
      )
  ).filter((a) => !a.lastRemindedAt || a.lastRemindedAt < cutoff);

  const dueActions = await db
    .select()
    .from(schema.applications)
    .where(
      and(
        eq(schema.applications.userId, userId),
        inArray(schema.applications.status, OPEN_STATUSES),
        isNotNull(schema.applications.nextActionDate),
        lt(schema.applications.nextActionDate, new Date(now)),
      ),
    );

  const byId = new Map<number, Candidate>();
  const add = (a: (typeof dueActions)[number], reason: Candidate["reason"]) => {
    if (byId.has(a.id)) return;
    byId.set(a.id, {
      id: a.id,
      userId,
      company: a.company,
      roleTitle: a.roleTitle,
      status: a.status,
      reason,
      daysQuiet: Math.floor((now - a.lastActivityAt.getTime()) / DAY),
      nextAction: a.nextAction,
    });
  };
  for (const a of quiet) add(a, "quiet");
  for (const a of dueActions) add(a, "next_action_due");
  return [...byId.values()];
}

// Days before a job's next performance review that the reminder sweep starts nudging.
export const REVIEW_REMINDER_DAYS = 14;

export type ReviewCandidate = {
  jobId: number;
  userId: string;
  company: string;
  title: string;
  nextReviewDate: string;
  daysUntil: number;
};

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Current jobs (no endDate) whose next review falls within `withinDays` from today and that
// have not been reminded for that review date yet (reviewRemindedFor tracks the date nudged,
// so moving the review date re-arms the reminder).
export async function reviewCandidatesForUser(userId: string, withinDays = REVIEW_REMINDER_DAYS): Promise<ReviewCandidate[]> {
  const today = isoDay(Date.now());
  const horizon = isoDay(Date.now() + withinDays * DAY);
  const rows = await db
    .select()
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.userId, userId),
        isNull(schema.jobs.endDate),
        isNotNull(schema.jobs.nextReviewDate),
        gte(schema.jobs.nextReviewDate, today),
        lte(schema.jobs.nextReviewDate, horizon),
        or(isNull(schema.jobs.reviewRemindedFor), ne(schema.jobs.reviewRemindedFor, schema.jobs.nextReviewDate)),
      ),
    );
  return rows.map((j) => ({
    jobId: j.id,
    userId,
    company: j.company,
    title: j.title,
    nextReviewDate: j.nextReviewDate!,
    daysUntil: Math.round((Date.parse(j.nextReviewDate!) - Date.parse(today)) / DAY),
  }));
}

// Users with at least one upcoming, un-nudged review (for the system-wide cron sweep).
export async function usersWithUpcomingReviews(withinDays = REVIEW_REMINDER_DAYS): Promise<string[]> {
  const rows = await db
    .select({ userId: schema.jobs.userId })
    .from(schema.jobs)
    .where(
      and(
        isNull(schema.jobs.endDate),
        isNotNull(schema.jobs.nextReviewDate),
        gte(schema.jobs.nextReviewDate, isoDay(Date.now())),
        lte(schema.jobs.nextReviewDate, isoDay(Date.now() + withinDays * DAY)),
      ),
    );
  return [...new Set(rows.map((r) => r.userId))];
}

// Record that the reminder for this review date went out.
export async function markReviewReminded(userId: string, jobId: number, date: string): Promise<void> {
  await db
    .update(schema.jobs)
    .set({ reviewRemindedFor: date })
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.userId, userId)));
}
