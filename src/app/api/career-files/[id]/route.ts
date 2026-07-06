import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";

async function getId(ctx: { params: Promise<{ id: string }> }) {
  return parseInt((await ctx.params).id, 10);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = await getId(ctx);
  const body = await req.json();
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string") update.name = body.name.trim();
  if (typeof body.content === "string") update.content = body.content;
  const updated = await db
    .update(schema.careerFiles)
    .set(update)
    .where(and(eq(schema.careerFiles.id, id), eq(schema.careerFiles.userId, user.id)))
    .returning({ id: schema.careerFiles.id });
  if (updated.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = await getId(ctx);
  const deleted = await db
    .delete(schema.careerFiles)
    .where(and(eq(schema.careerFiles.id, id), eq(schema.careerFiles.userId, user.id)))
    .returning({ id: schema.careerFiles.id });
  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
