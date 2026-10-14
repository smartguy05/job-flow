import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { compInput } from "@/lib/job-input";

type Ctx = { params: Promise<{ id: string; compId: string }> };

async function ids(ctx: Ctx) {
  const p = await ctx.params;
  return { jobId: parseInt(p.id, 10), compId: parseInt(p.compId, 10) };
}

const scope = (userId: string, jobId: number, compId: number) =>
  and(
    eq(schema.jobCompensation.id, compId),
    eq(schema.jobCompensation.jobId, jobId),
    eq(schema.jobCompensation.userId, userId),
  );

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const { jobId, compId } = await ids(ctx);
  const { values, error } = compInput(await req.json());
  if (error) return NextResponse.json({ error }, { status: 400 });
  const updated = await db
    .update(schema.jobCompensation)
    .set(values)
    .where(scope(user.id, jobId, compId))
    .returning({ id: schema.jobCompensation.id });
  if (updated.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const { jobId, compId } = await ids(ctx);
  const deleted = await db
    .delete(schema.jobCompensation)
    .where(scope(user.id, jobId, compId))
    .returning({ id: schema.jobCompensation.id });
  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
