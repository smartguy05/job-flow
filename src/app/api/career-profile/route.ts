import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const [row] = await db
    .select()
    .from(schema.careerProfile)
    .where(eq(schema.careerProfile.userId, user.id))
    .limit(1);
  return NextResponse.json({ content: row?.content ?? "", updatedAt: row?.updatedAt ?? null });
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const { content } = await req.json();
  if (typeof content !== "string") return NextResponse.json({ error: "content required" }, { status: 400 });
  await db
    .insert(schema.careerProfile)
    .values({ userId: user.id, content, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.careerProfile.userId, set: { content, updatedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
