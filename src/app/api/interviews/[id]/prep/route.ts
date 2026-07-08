import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { generateInterviewPrep } from "@/lib/llm";
import { InterviewPrepSchema } from "@/lib/interview-prep-content";
import { logEvent } from "@/lib/events";
import { getUser, unauthorized } from "@/lib/auth";

export const maxDuration = 120;

// Load an interview (joined to its application) scoped to the signed-in user.
async function loadInterview(id: number, userId: string) {
  const [iv] = await db
    .select({
      id: schema.interviews.id,
      applicationId: schema.interviews.applicationId,
      round: schema.interviews.round,
      interviewer: schema.interviews.interviewer,
      company: schema.applications.company,
      roleTitle: schema.applications.roleTitle,
      jdSnapshot: schema.applications.jdSnapshot,
      sourceRaw: schema.applications.sourceRaw,
      seniorityLevel: schema.applications.seniorityLevel,
      techStack: schema.applications.techStack,
    })
    .from(schema.interviews)
    .innerJoin(schema.applications, eq(schema.interviews.applicationId, schema.applications.id))
    .where(and(eq(schema.interviews.id, id), eq(schema.interviews.userId, userId)))
    .limit(1);
  return iv;
}

// Generate (or regenerate) the AI interview prep pack and persist it on the interview.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const id = parseInt((await ctx.params).id, 10);
    const iv = await loadInterview(id, user.id);
    if (!iv) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const pack = await generateInterviewPrep({
      userId: user.id,
      application: {
        company: iv.company,
        roleTitle: iv.roleTitle,
        jdSnapshot: iv.jdSnapshot || iv.sourceRaw || "",
        seniorityLevel: iv.seniorityLevel,
        techStack: iv.techStack,
      },
      interview: { round: iv.round, interviewer: iv.interviewer },
    });

    await db
      .update(schema.interviews)
      .set({ prepPackJson: JSON.stringify(pack), prepGeneratedAt: new Date() })
      .where(and(eq(schema.interviews.id, id), eq(schema.interviews.userId, user.id)));
    await logEvent(user.id, iv.applicationId, "interview_prep", `${iv.round || "Interview"} prep`);
    return NextResponse.json(pack);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Save hand-edits to an existing prep pack.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const id = parseInt((await ctx.params).id, 10);
    const parsed = InterviewPrepSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid prep pack" }, { status: 400 });

    const updated = await db
      .update(schema.interviews)
      .set({ prepPackJson: JSON.stringify(parsed.data) })
      .where(and(eq(schema.interviews.id, id), eq(schema.interviews.userId, user.id)))
      .returning({ id: schema.interviews.id });
    if (updated.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(parsed.data);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
