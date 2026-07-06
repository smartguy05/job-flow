import { db, schema } from "@/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { randomToken } from "@/lib/auth/oidc";
import type { CalendarEvent } from "@/lib/calendar";

// DB-backed calendar helpers shared by the in-app JSON route (`/api/calendar`) and the
// token-authed `.ics` feed (`/api/calendar/feed`). Kept out of `src/lib/calendar.ts`,
// which is intentionally DB-free.

// Aggregate every dated item across a user's applications into a flat CalendarEvent list:
// scheduled interviews, application deadlines, and next-action dates. All queries are
// scoped by userId.
export async function getCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  const [interviews, deadlines, nextActions] = await Promise.all([
    db
      .select({
        id: schema.interviews.id,
        date: schema.interviews.scheduledAt,
        applicationId: schema.interviews.applicationId,
        round: schema.interviews.round,
        outcome: schema.interviews.outcome,
        company: schema.applications.company,
        roleTitle: schema.applications.roleTitle,
        status: schema.applications.status,
      })
      .from(schema.interviews)
      .innerJoin(schema.applications, eq(schema.interviews.applicationId, schema.applications.id))
      .where(and(eq(schema.interviews.userId, userId), isNotNull(schema.interviews.scheduledAt))),
    db
      .select({
        date: schema.applications.applicationDeadline,
        applicationId: schema.applications.id,
        company: schema.applications.company,
        roleTitle: schema.applications.roleTitle,
        status: schema.applications.status,
      })
      .from(schema.applications)
      .where(and(eq(schema.applications.userId, userId), isNotNull(schema.applications.applicationDeadline))),
    db
      .select({
        date: schema.applications.nextActionDate,
        applicationId: schema.applications.id,
        nextAction: schema.applications.nextAction,
        company: schema.applications.company,
        roleTitle: schema.applications.roleTitle,
        status: schema.applications.status,
      })
      .from(schema.applications)
      .where(and(eq(schema.applications.userId, userId), isNotNull(schema.applications.nextActionDate))),
  ]);

  return [
    ...interviews.map((r) => ({
      type: "interview" as const,
      date: r.date!.toISOString(),
      applicationId: r.applicationId,
      sourceId: r.id,
      company: r.company,
      roleTitle: r.roleTitle,
      title: r.round ?? "Interview",
      outcome: r.outcome,
      status: r.status,
    })),
    ...deadlines.map((r) => ({
      type: "deadline" as const,
      date: r.date!.toISOString(),
      applicationId: r.applicationId,
      company: r.company,
      roleTitle: r.roleTitle,
      title: "Application deadline",
      status: r.status,
    })),
    ...nextActions.map((r) => ({
      type: "next_action" as const,
      date: r.date!.toISOString(),
      applicationId: r.applicationId,
      company: r.company,
      roleTitle: r.roleTitle,
      title: r.nextAction ?? "Next action",
      status: r.status,
    })),
  ];
}

// Return the user's existing feed token, minting and persisting one on first use.
export async function getOrCreateCalendarToken(userId: string): Promise<string> {
  const [existing] = await db
    .select({ token: schema.users.calendarToken })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (existing?.token) return existing.token;
  return regenerateCalendarToken(userId);
}

// Mint a fresh token, invalidating any existing subscription URL. Returns the new token.
export async function regenerateCalendarToken(userId: string): Promise<string> {
  const token = randomToken();
  await db.update(schema.users).set({ calendarToken: token }).where(eq(schema.users.id, userId));
  return token;
}

// Resolve the owning user id for a feed token. Returns null for an empty/unknown token so a
// user whose token is still null can never be matched by a missing/blank query param.
export async function findUserIdByCalendarToken(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.calendarToken, token));
  return row?.id ?? null;
}
