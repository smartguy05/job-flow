import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getUser, unauthorized } from "@/lib/auth";
import { benefitsInput } from "@/lib/job-input";
import { getOwnedJob } from "@/lib/jobs";

// Upsert the benefits package for a job (one row per job). Omitted fields are kept.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const job = await getOwnedJob(user.id, parseInt((await ctx.params).id, 10));
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { values, error } = benefitsInput(await req.json());
  if (error) return NextResponse.json({ error }, { status: 400 });
  const set = { ...values, updatedAt: new Date() };
  await db
    .insert(schema.jobBenefits)
    .values({ ...set, jobId: job.id, userId: user.id })
    .onConflictDoUpdate({ target: schema.jobBenefits.jobId, set });
  return NextResponse.json({ ok: true });
}
