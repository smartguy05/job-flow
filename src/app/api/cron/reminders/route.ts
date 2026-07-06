import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, inArray, lt, eq, isNotNull } from "drizzle-orm";
import { getSettings } from "@/lib/settings";
import { sendNtfy } from "@/lib/ntfy";
import { logEvent } from "@/lib/events";
import { getUser, unauthorized } from "@/lib/auth";

const OPEN = ["applied", "in_progress"];
const DAY = 24 * 60 * 60 * 1000;

type Candidate = {
  id: number;
  userId: string;
  company: string;
  roleTitle: string;
  status: string;
  reason: "quiet" | "next_action_due";
  daysQuiet: number;
  nextAction: string | null;
};

// Applications belonging to one user that need attention: quiet past their window OR with
// a due next action. De-duplicated by id (quiet takes precedence in the label).
async function candidatesForUser(userId: string, quietDays: number): Promise<Candidate[]> {
  const now = Date.now();
  const cutoff = new Date(now - quietDays * DAY);

  const quiet = (
    await db
      .select()
      .from(schema.applications)
      .where(
        and(
          eq(schema.applications.userId, userId),
          inArray(schema.applications.status, OPEN),
          lt(schema.applications.lastActivityAt, cutoff),
        ),
      )
  ).filter((a) => !a.lastRemindedAt || a.lastRemindedAt < a.lastActivityAt);

  const dueActions = await db
    .select()
    .from(schema.applications)
    .where(
      and(
        eq(schema.applications.userId, userId),
        inArray(schema.applications.status, OPEN),
        isNotNull(schema.applications.nextActionDate),
        lt(schema.applications.nextActionDate, new Date(now)),
      ),
    );

  const byId = new Map<number, Candidate>();
  for (const a of quiet) {
    byId.set(a.id, {
      id: a.id,
      userId,
      company: a.company,
      roleTitle: a.roleTitle,
      status: a.status,
      reason: "quiet",
      daysQuiet: Math.floor((now - a.lastActivityAt.getTime()) / DAY),
      nextAction: a.nextAction,
    });
  }
  for (const a of dueActions) {
    if (byId.has(a.id)) continue;
    byId.set(a.id, {
      id: a.id,
      userId,
      company: a.company,
      roleTitle: a.roleTitle,
      status: a.status,
      reason: "next_action_due",
      daysQuiet: Math.floor((now - a.lastActivityAt.getTime()) / DAY),
      nextAction: a.nextAction,
    });
  }
  return [...byId.values()];
}

// Called by the container's cron. System-triggered (no user session): iterate every user
// with open applications and push per-user ntfy nudges using their own settings.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const openApps = await db
    .select({ userId: schema.applications.userId })
    .from(schema.applications)
    .where(inArray(schema.applications.status, OPEN));
  const userIds = [...new Set(openApps.map((a) => a.userId))];

  const baseUrl = process.env.APP_BASE_URL || "";
  let candidateCount = 0;
  let sent = 0;

  for (const userId of userIds) {
    const s = await getSettings(userId);
    const candidates = await candidatesForUser(userId, s.reminderQuietDays);
    candidateCount += candidates.length;
    for (const c of candidates) {
      const message =
        c.reason === "next_action_due"
          ? `${c.roleTitle} — next action due: ${c.nextAction || "follow up"}.`
          : `${c.roleTitle} — no activity for ${c.daysQuiet} days.`;
      const ok = await sendNtfy(userId, {
        title: `Follow up: ${c.company}`,
        message,
        tags: ["hourglass"],
        click: baseUrl ? `${baseUrl}/applications/${c.id}` : undefined,
      });
      await db
        .update(schema.applications)
        .set({ lastRemindedAt: new Date() })
        .where(and(eq(schema.applications.id, c.id), eq(schema.applications.userId, userId)));
      await logEvent(userId, c.id, "reminder_sent", c.reason === "next_action_due" ? "Next action due" : `Quiet ${c.daysQuiet}d`);
      if (ok) sent++;
    }
  }

  return NextResponse.json({ candidates: candidateCount, notificationsSent: sent });
}

// In-app "needs attention" view for the signed-in user. This route is exempt from the
// auth middleware (POST uses x-cron-secret), so GET self-guards with a user session.
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const s = await getSettings(user.id);
  return NextResponse.json(await candidatesForUser(user.id, s.reminderQuietDays));
}
