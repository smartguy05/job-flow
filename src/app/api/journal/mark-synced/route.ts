import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";

// Mark journal entries (and optionally jobs) as folded into the career profile. Called by the client after it
// saves an accepted profile-sync proposal via PUT /api/career-profile.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const { entryIds, jobIds = [] } = await req.json();
  const isIntArray = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => Number.isInteger(n));
  if (!isIntArray(entryIds) || !isIntArray(jobIds)) {
    return NextResponse.json({ error: "entryIds and jobIds must be arrays of integers" }, { status: 400 });
  }
  const now = new Date();
  if (entryIds.length) {
    await db
      .update(schema.journalEntries)
      .set({ syncedAt: now })
      .where(and(eq(schema.journalEntries.userId, user.id), inArray(schema.journalEntries.id, entryIds)));
  }
  if (jobIds.length) {
    await db
      .update(schema.jobs)
      .set({ profileSyncedAt: now })
      .where(and(eq(schema.jobs.userId, user.id), inArray(schema.jobs.id, jobIds)));
  }
  return NextResponse.json({ ok: true });
}
