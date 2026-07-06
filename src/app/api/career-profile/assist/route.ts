import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { assistCareerProfile } from "@/lib/llm";
import { getUser, unauthorized } from "@/lib/auth";

export const maxDuration = 180;

// AI-assisted edit: fold new details into the career markdown. Returns proposed
// content for review; the client saves via PUT /api/career-profile if accepted.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const { instruction } = await req.json();
    if (!instruction?.trim()) return NextResponse.json({ error: "instruction required" }, { status: 400 });
    const [row] = await db
      .select()
      .from(schema.careerProfile)
      .where(eq(schema.careerProfile.userId, user.id))
      .limit(1);
    const updated = await assistCareerProfile({ userId: user.id, current: row?.content ?? "", instruction });
    return NextResponse.json({ content: updated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
