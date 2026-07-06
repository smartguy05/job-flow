import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { defaultResumeSkill } from "@/lib/career";

// The user's editable resume-generation "skill" instructions. When they haven't saved a
// custom version, `content` is empty and `effective`/`isDefault` reflect the shipped default.
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const [row] = await db
    .select()
    .from(schema.resumeSkill)
    .where(eq(schema.resumeSkill.userId, user.id))
    .limit(1);
  const custom = row?.content ?? "";
  return NextResponse.json({
    content: custom,
    isDefault: !custom.trim(),
    default: defaultResumeSkill(),
    updatedAt: row?.updatedAt ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const { content } = await req.json();
  if (typeof content !== "string") return NextResponse.json({ error: "content required" }, { status: 400 });
  await db
    .insert(schema.resumeSkill)
    .values({ userId: user.id, content, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.resumeSkill.userId, set: { content, updatedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
