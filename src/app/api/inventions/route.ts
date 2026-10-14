import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { asc, eq, max } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { inventionInput } from "@/lib/inventions";
import { serializeTech } from "@/lib/jobs";

// Prior inventions ("Exhibit A") in display order.
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const rows = await db
    .select()
    .from(schema.inventions)
    .where(eq(schema.inventions.userId, user.id))
    .orderBy(asc(schema.inventions.sortOrder), asc(schema.inventions.id));
  return NextResponse.json(rows.map(serializeTech));
}

// Create one entry ({...}) or many ([{...}], from an import preview). New entries are
// appended after the current last one. → { id } or { ids }.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const body = await req.json();
  const items: Record<string, unknown>[] = Array.isArray(body) ? body : [body];
  if (items.length === 0 || items.length > 200) {
    return NextResponse.json({ error: "Provide 1–200 entries" }, { status: 400 });
  }
  const parsed = items.map((it) => inventionInput(it ?? {}, { create: true }));
  const bad = parsed.findIndex((p) => p.error);
  if (bad !== -1) {
    return NextResponse.json({ error: Array.isArray(body) ? `Entry ${bad + 1}: ${parsed[bad].error}` : parsed[bad].error }, { status: 400 });
  }
  const [{ last }] = await db
    .select({ last: max(schema.inventions.sortOrder) })
    .from(schema.inventions)
    .where(eq(schema.inventions.userId, user.id));
  const start = (last ?? 0) + 1;
  const rows = await db
    .insert(schema.inventions)
    .values(
      parsed.map((p, i) => ({
        sortOrder: start + i,
        ...(p.values as { title: string }),
        userId: user.id,
      })),
    )
    .returning({ id: schema.inventions.id });
  return NextResponse.json(Array.isArray(body) ? { ids: rows.map((r) => r.id) } : { id: rows[0].id });
}
