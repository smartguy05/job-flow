import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = parseInt((await ctx.params).id, 10);
  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (body.scheduledAt !== undefined) update.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  for (const f of ["round", "interviewer", "prepNotes", "outcome"]) {
    if (body[f] !== undefined) update[f] = body[f];
  }
  const updated = await db
    .update(schema.interviews)
    .set(update)
    .where(and(eq(schema.interviews.id, id), eq(schema.interviews.userId, user.id)))
    .returning({ id: schema.interviews.id });
  if (updated.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = parseInt((await ctx.params).id, 10);
  const deleted = await db
    .delete(schema.interviews)
    .where(and(eq(schema.interviews.id, id), eq(schema.interviews.userId, user.id)))
    .returning({ id: schema.interviews.id });
  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
