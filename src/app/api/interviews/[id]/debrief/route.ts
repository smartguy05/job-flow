import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { synthesizeDebrief } from "@/lib/llm";
import { logEvent } from "@/lib/events";
import { getUser, unauthorized } from "@/lib/auth";

export const maxDuration = 120;

// Store the debrief answers, synthesize a summary/action-items/sentiment, and persist them.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const id = parseInt((await ctx.params).id, 10);
    const body = await req.json();
    const answers: string[] = Array.isArray(body.answers) ? body.answers : [];

    const [iv] = await db
      .select({
        id: schema.interviews.id,
        applicationId: schema.interviews.applicationId,
        round: schema.interviews.round,
        interviewer: schema.interviews.interviewer,
        transcript: schema.interviews.transcript,
        debriefQuestions: schema.interviews.debriefQuestions,
        company: schema.applications.company,
        roleTitle: schema.applications.roleTitle,
      })
      .from(schema.interviews)
      .innerJoin(schema.applications, eq(schema.interviews.applicationId, schema.applications.id))
      .where(and(eq(schema.interviews.id, id), eq(schema.interviews.userId, user.id)))
      .limit(1);
    if (!iv) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const questions: string[] = JSON.parse(iv.debriefQuestions || "[]");
    const result = await synthesizeDebrief({
      userId: user.id,
      interview: {
        round: iv.round,
        interviewer: iv.interviewer,
        company: iv.company,
        roleTitle: iv.roleTitle,
      },
      transcript: iv.transcript,
      questions,
      answers,
    });

    await db
      .update(schema.interviews)
      .set({
        debriefAnswers: JSON.stringify(answers),
        debriefSummary: result.summary,
        debriefActionItems: JSON.stringify(result.actionItems),
        debriefSentiment: JSON.stringify(result.sentiment),
        debriefAt: new Date(),
      })
      .where(and(eq(schema.interviews.id, id), eq(schema.interviews.userId, user.id)));
    await logEvent(user.id, iv.applicationId, "interview", "Debrief completed");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
