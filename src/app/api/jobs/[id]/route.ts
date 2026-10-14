import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { jobInput } from "@/lib/job-input";
import { compSummary, getOwnedJob, mergeTechnologies, parseTechList, serializeTech, tenureMonths, todayISO } from "@/lib/jobs";

type Ctx = { params: Promise<{ id: string }> };
const getId = async (ctx: Ctx) => parseInt((await ctx.params).id, 10);
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

// Full job detail: the job, its comp timeline + summary, benefits, journal and the merged
// technology list (job-level plus every journal entry's).
export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const job = await getOwnedJob(user.id, await getId(ctx));
  if (!job) return notFound();
  const compensation = await db
    .select()
    .from(schema.jobCompensation)
    .where(and(eq(schema.jobCompensation.jobId, job.id), eq(schema.jobCompensation.userId, user.id)))
    .orderBy(asc(schema.jobCompensation.effectiveDate), asc(schema.jobCompensation.id));
  const [benefits] = await db
    .select()
    .from(schema.jobBenefits)
    .where(and(eq(schema.jobBenefits.jobId, job.id), eq(schema.jobBenefits.userId, user.id)));
  const entries = await db
    .select()
    .from(schema.journalEntries)
    .where(and(eq(schema.journalEntries.jobId, job.id), eq(schema.journalEntries.userId, user.id)))
    .orderBy(desc(schema.journalEntries.entryDate), desc(schema.journalEntries.id));
  return NextResponse.json({
    job: { ...serializeTech(job), tenureMonths: tenureMonths(job.startDate, job.endDate, todayISO()) },
    compensation,
    compSummary: compSummary(compensation),
    benefits: benefits ?? null,
    entries: entries.map(serializeTech),
    technologies: mergeTechnologies(parseTechList(job.technologies), ...entries.map((e) => parseTechList(e.technologies))),
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = await getId(ctx);
  const { values, error } = jobInput(await req.json());
  if (error) return NextResponse.json({ error }, { status: 400 });
  const updated = await db
    .update(schema.jobs)
    .set({ ...values, profileSyncedAt: null, updatedAt: new Date() }) // edited → offer in next sync
    .where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, user.id)))
    .returning({ id: schema.jobs.id });
  if (updated.length === 0) return notFound();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = await getId(ctx);
  const deleted = await db
    .delete(schema.jobs)
    .where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, user.id)))
    .returning({ id: schema.jobs.id });
  if (deleted.length === 0) return notFound();
  return NextResponse.json({ ok: true });
}
