import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { inventionInput } from "@/lib/inventions";

type Ctx = { params: Promise<{ id: string }> };
const scope = (userId: string, id: number) => and(eq(schema.inventions.id, id), eq(schema.inventions.userId, userId));

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = parseInt((await ctx.params).id, 10);
  const { values, error } = inventionInput(await req.json());
  if (error) return NextResponse.json({ error }, { status: 400 });
  const updated = await db
    .update(schema.inventions)
    .set({ ...values, updatedAt: new Date() })
    .where(scope(user.id, id))
    .returning({ id: schema.inventions.id });
  if (updated.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = parseInt((await ctx.params).id, 10);
  const deleted = await db.delete(schema.inventions).where(scope(user.id, id)).returning({ id: schema.inventions.id });
  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
