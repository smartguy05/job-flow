import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { ImportedJobsSchema } from "@/lib/job-import-content";
import { jobKey, mergeTechnologies, todayISO } from "@/lib/jobs";
import { normalizeCompany } from "@/lib/dedup";

// Save the jobs the user selected from the import preview. Their facts and achievements
// came from the profile, so jobs and entries are created already marked as synced.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const parsed = ImportedJobsSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid jobs payload" }, { status: 400 });

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
  return NextResponse.json({ created, skipped });
}
