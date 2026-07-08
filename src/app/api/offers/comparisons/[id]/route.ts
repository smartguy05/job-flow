import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";

// Fetch one saved comparison (with its snapshotted table + verdict).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = parseInt((await ctx.params).id, 10);
  const [row] = await db
    .select()
    .from(schema.offerComparisons)
    .where(and(eq(schema.offerComparisons.id, id), eq(schema.offerComparisons.userId, user.id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    id: row.id,
    title: row.title,
    applicationIds: JSON.parse(row.applicationIds) as number[],
    priorities: row.priorities,
    result: JSON.parse(row.resultJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

// Delete a saved comparison.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = parseInt((await ctx.params).id, 10);
  const deleted = await db
    .delete(schema.offerComparisons)
    .where(and(eq(schema.offerComparisons.id, id), eq(schema.offerComparisons.userId, user.id)))
    .returning({ id: schema.offerComparisons.id });
  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
