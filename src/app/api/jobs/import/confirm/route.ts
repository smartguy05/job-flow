import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { ImportedJobsSchema } from "@/lib/job-import-content";
import { createJobFromApplication, jobKey, mergeTechnologies, todayISO, unlinkedWonApplications } from "@/lib/jobs";
import { normalizeCompany } from "@/lib/dedup";

// Save what the user selected from the import preview:
// - `jobs` (from the profile): facts and achievements came from the profile, so jobs and
//   entries are created already marked as synced; duplicates are skipped.
// - `applicationIds`: closed_won applications without a job get one, started on the date
//   they were won. Anything not owned, not won, or already linked is skipped.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const body = await req.json();
  const parsed = ImportedJobsSchema.safeParse({ jobs: body.jobs ?? [] });
  const applicationIds: unknown = body.applicationIds ?? [];
  if (!parsed.success || !Array.isArray(applicationIds) || !applicationIds.every((n) => Number.isInteger(n))) {
    return NextResponse.json({ error: "Invalid import payload" }, { status: 400 });
  }

  const seen = new Set(
    (await db.select().from(schema.jobs).where(eq(schema.jobs.userId, user.id))).map(jobKey),
  );
  const now = new Date();
  let created = 0;
  let skipped = 0;
  for (const j of parsed.data.jobs) {
    const key = jobKey(j);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    const [job] = await db
      .insert(schema.jobs)
      .values({
        userId: user.id,
        company: j.company,
        companyNormalized: normalizeCompany(j.company),
        title: j.title,
        startDate: j.startDate,
        endDate: j.endDate,
        technologies: JSON.stringify(mergeTechnologies(j.technologies)),
        profileSyncedAt: now,
      })
      .returning({ id: schema.jobs.id });
    const entryDate = j.endDate ?? j.startDate ?? todayISO();
    const achievements = j.achievements.map((a) => a.trim()).filter(Boolean);
    if (achievements.length) {
      await db.insert(schema.journalEntries).values(
        achievements.map((title) => ({
          userId: user.id,
          jobId: job.id,
          kind: "achievement",
          title,
          entryDate,
          syncedAt: now,
        })),
      );
    }
    created++;
  }
  const won = new Map((await unlinkedWonApplications(user.id)).map((w) => [w.app.id, w]));
  for (const id of new Set(applicationIds as number[])) {
    const w = won.get(id);
    if (!w) {
      skipped++;
      continue;
    }
    await createJobFromApplication(user.id, w.app, w.wonDate);
    created++;
  }
  return NextResponse.json({ created, skipped });
}
