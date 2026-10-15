import { db, schema } from "@/db";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";

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
