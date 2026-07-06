import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const rows = await db
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.userId, user.id))
    .orderBy(desc(schema.contacts.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const [row] = await db
    .insert(schema.contacts)
    .values({
      userId: user.id,
      name: body.name,
      agency: body.agency ?? null,
      email: body.email ?? null,
      linkedin: body.linkedin ?? null,
      notes: body.notes ?? null,
    })
    .returning({ id: schema.contacts.id });
  return NextResponse.json({ id: row.id });
}
