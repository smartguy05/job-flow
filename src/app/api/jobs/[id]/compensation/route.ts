import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, asc, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { compInput } from "@/lib/job-input";
import { getOwnedJob } from "@/lib/jobs";

type Ctx = { params: Promise<{ id: string }> };

// A job's compensation timeline: starting pay, raises, promotions, bonus payouts, grants.
export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const job = await getOwnedJob(user.id, parseInt((await ctx.params).id, 10));
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rows = await db
    .select()
    .from(schema.jobCompensation)
    .where(and(eq(schema.jobCompensation.jobId, job.id), eq(schema.jobCompensation.userId, user.id)))
    .orderBy(asc(schema.jobCompensation.effectiveDate), asc(schema.jobCompensation.id));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const job = await getOwnedJob(user.id, parseInt((await ctx.params).id, 10));
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { values, error } = compInput(await req.json());
  if (error) return NextResponse.json({ error }, { status: 400 });
  const [row] = await db
    .insert(schema.jobCompensation)
    .values({ ...values, userId: user.id, jobId: job.id })
    .returning({ id: schema.jobCompensation.id });
  return NextResponse.json({ id: row.id });
}
