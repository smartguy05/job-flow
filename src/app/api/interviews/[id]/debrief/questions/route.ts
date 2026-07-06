import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { generateDebriefQuestions } from "@/lib/llm";
import { getUser, unauthorized } from "@/lib/auth";

export const maxDuration = 120;

// Generate tailored gap-filling debrief questions for the interview and store them.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const id = parseInt((await ctx.params).id, 10);
    const [iv] = await db
      .select({
        id: schema.interviews.id,
        round: schema.interviews.round,
        interviewer: schema.interviews.interviewer,
        transcript: schema.interviews.transcript,
        company: schema.applications.company,
        roleTitle: schema.applications.roleTitle,
      })
      .from(schema.interviews)
      .innerJoin(schema.applications, eq(schema.interviews.applicationId, schema.applications.id))
      .where(and(eq(schema.interviews.id, id), eq(schema.interviews.userId, user.id)))
      .limit(1);
    if (!iv) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const questions = await generateDebriefQuestions({
      userId: user.id,
      interview: {
        round: iv.round,
        interviewer: iv.interviewer,
        company: iv.company,
        roleTitle: iv.roleTitle,
      },
      transcript: iv.transcript,
    });

    await db
      .update(schema.interviews)
      .set({ debriefQuestions: JSON.stringify(questions) })
      .where(and(eq(schema.interviews.id, id), eq(schema.interviews.userId, user.id)));
    return NextResponse.json({ questions });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
