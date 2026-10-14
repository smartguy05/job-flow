import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { assistCareerProfile } from "@/lib/llm";
import { compSummary } from "@/lib/jobs";
import { buildSyncInstruction, SYNCABLE_KINDS } from "@/lib/profile-sync";

export const maxDuration = 180;

// Propose a career-profile update from employment history + unsynced journal wins. Returns
// {current, proposed, entryIds, jobIds} for review; nothing is saved. On accept the client
// PUTs /api/career-profile and then POSTs the ids to /api/journal/mark-synced.
//
// Body {jobIds?}: explicit jobs to include; default = every job that is unsynced or has
// unsynced achievement/feedback entries.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    const requested: number[] | undefined = Array.isArray(body.jobIds)
      ? body.jobIds.filter((n: unknown) => Number.isInteger(n))
      : undefined;

    const allJobs = await db.select().from(schema.jobs).where(eq(schema.jobs.userId, user.id));
    const pendingEntries = (
      await db
        .select()
        .from(schema.journalEntries)
        .where(and(eq(schema.journalEntries.userId, user.id), isNull(schema.journalEntries.syncedAt)))
    ).filter((e) => SYNCABLE_KINDS.has(e.kind));

    const jobs = requested
      ? allJobs.filter((j) => requested.includes(j.id))
      : allJobs.filter((j) => j.profileSyncedAt == null || pendingEntries.some((e) => e.jobId === j.id));
    if (jobs.length === 0) {
      return NextResponse.json({ error: "Nothing new to add to your profile" }, { status: 400 });
    }

    const jobIds = jobs.map((j) => j.id);
    const comp = await db
      .select()
      .from(schema.jobCompensation)
      .where(and(eq(schema.jobCompensation.userId, user.id), inArray(schema.jobCompensation.jobId, jobIds)));
    const withTitles = jobs.map((j) => {
      const { titles } = compSummary(comp.filter((c) => c.jobId === j.id));
      return { ...j, titles: titles.length ? titles : undefined };
    });

    const { instruction, entryIds } = buildSyncInstruction(withTitles, pendingEntries);
    const [profile] = await db
      .select()
      .from(schema.careerProfile)
      .where(eq(schema.careerProfile.userId, user.id))
      .limit(1);
    const current = profile?.content ?? "";
    const proposed = await assistCareerProfile({ userId: user.id, current, instruction });
    return NextResponse.json({ current, proposed, entryIds, jobIds });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
