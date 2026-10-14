import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { extractJobsFromProfile } from "@/lib/llm";
import { matchExisting, unlinkedWonApplications } from "@/lib/jobs";
import { formatPay } from "@/lib/job-fields";

export const maxDuration = 180;

// Backfill preview, two sources (nothing is saved; confirm via ./confirm):
// - `applications`: closed_won applications that have no job yet;
// - `jobs`: past jobs extracted from the career profile (skipped when it's empty).
// Each item carries `match` — "exact" / "possible" duplicate of a tracked job (profile jobs
// are also matched against the won applications listed), or null.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const [profile] = await db
      .select()
      .from(schema.careerProfile)
      .where(eq(schema.careerProfile.userId, user.id))
      .limit(1);
    const won = await unlinkedWonApplications(user.id);
    const hasProfile = !!profile?.content.trim();
    if (!hasProfile && won.length === 0) {
      return NextResponse.json(
        { error: "Nothing to import: your career profile is empty and there are no won applications without a job" },
        { status: 400 },
      );
    }

    const existing = await db.select().from(schema.jobs).where(eq(schema.jobs.userId, user.id));
    const applications = won.map(({ app, wonDate }) => ({
      applicationId: app.id,
      company: app.company,
      roleTitle: app.roleTitle,
      wonDate,
      pay: formatPay(app),
      match: matchExisting({ company: app.company, title: app.roleTitle, startDate: wonDate }, existing),
    }));

    const extracted = hasProfile ? await extractJobsFromProfile({ userId: user.id, profile: profile.content }) : [];
    const known = [
      ...existing,
      ...applications.map((a) => ({ company: a.company, title: a.roleTitle, startDate: a.wonDate })),
    ];
    const jobs = extracted.map((j) => ({ ...j, match: matchExisting(j, known) }));
    return NextResponse.json({ jobs, applications });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
