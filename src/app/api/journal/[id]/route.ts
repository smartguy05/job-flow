import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { journalInput } from "@/lib/job-input";

type Ctx = { params: Promise<{ id: string }> };
const scope = (userId: string, id: number) =>
  and(eq(schema.journalEntries.id, id), eq(schema.journalEntries.userId, userId));

// Editing an entry clears syncedAt so the change is offered in the next profile sync.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = parseInt((await ctx.params).id, 10);
  const { values, error } = journalInput(await req.json());
  if (error) return NextResponse.json({ error }, { status: 400 });
  const updated = await db
    .update(schema.journalEntries)
    .set({ ...values, syncedAt: null, updatedAt: new Date() })
    .where(scope(user.id, id))
    .returning({ id: schema.journalEntries.id });
  if (updated.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = parseInt((await ctx.params).id, 10);
  const deleted = await db
    .delete(schema.journalEntries)
    .where(scope(user.id, id))
    .returning({ id: schema.journalEntries.id });
  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
