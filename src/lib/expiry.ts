import { db, schema } from "@/db";
import { and, eq, inArray, lt } from "drizzle-orm";

// Open (still-active) statuses eligible to expire. Mirrors the reminder sweep's OPEN set.
const OPEN = ["applied", "in_progress"];
const DAY = 24 * 60 * 60 * 1000;

// Move a user's open applications to the terminal "expired" status once they have had no
// activity for `days` days. Deliberately does NOT bump lastActivityAt (a direct status
// update + event insert, not logEvent), so the list keeps showing the true last-active date
// and the expiry itself doesn't look like fresh activity. A non-positive `days` disables
// expiry. Returns the number of applications expired.
export async function expireStaleApplications(userId: string, days: number): Promise<number> {
  if (!days || days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * DAY);

  const stale = await db
    .select()
    .from(schema.applications)
    .where(
      and(
        eq(schema.applications.userId, userId),
        inArray(schema.applications.status, OPEN),
        lt(schema.applications.lastActivityAt, cutoff),
      ),
    );

  for (const a of stale) {
    await db
      .update(schema.applications)
      .set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(schema.applications.id, a.id), eq(schema.applications.userId, userId)));
    await db.insert(schema.events).values({
      userId,
      applicationId: a.id,
      type: "expired",
      detail: `No activity for ${days} days`,
    });
  }

  return stale.length;
}
