import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { extractJobsFromProfile } from "@/lib/llm";
import { jobKey } from "@/lib/jobs";

export const maxDuration = 180;

// Backfill preview: extract past jobs from the career profile. Nothing is saved; each job
// is flagged `duplicate` when an equivalent job is already tracked. Confirm via ./confirm.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const [profile] = await db
      .select()
      .from(schema.careerProfile)
      .where(eq(schema.careerProfile.userId, user.id))
      .limit(1);
    if (!profile?.content.trim()) {
      return NextResponse.json({ error: "Your career profile is empty" }, { status: 400 });
    }
    const extracted = await extractJobsFromProfile({ userId: user.id, profile: profile.content });
    const existing = new Set(
      (await db.select().from(schema.jobs).where(eq(schema.jobs.userId, user.id))).map(jobKey),
    );
    return NextResponse.json({ jobs: extracted.map((j) => ({ ...j, duplicate: existing.has(jobKey(j)) })) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
