import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq, isNull, max, or } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { dedupeImports } from "@/lib/interview-questions";
import { InterviewPrepSchema } from "@/lib/interview-prep-content";

// Copy an interview prep pack's "questions to ask" into this job's checklist.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const appId = parseInt((await ctx.params).id, 10);
  const body = await req.json().catch(() => ({}));
  const interviewId = body?.interviewId;

  const [app] = await db
    .select({ id: schema.applications.id })
    .from(schema.applications)
    .where(and(eq(schema.applications.id, appId), eq(schema.applications.userId, user.id)))
    .limit(1);
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!Number.isInteger(interviewId)) {
    return NextResponse.json({ error: "interviewId required" }, { status: 400 });
  }

  const [iv] = await db
    .select()
    .from(schema.interviews)
    .where(
      and(
        eq(schema.interviews.id, interviewId),
        eq(schema.interviews.userId, user.id),
        eq(schema.interviews.applicationId, appId),
      ),
    )
    .limit(1);
  if (!iv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let incoming: string[] = [];
  if (iv.prepPackJson) {
    try {
      const parsed = InterviewPrepSchema.safeParse(JSON.parse(iv.prepPackJson));
      if (parsed.success) incoming = parsed.data.questionsToAsk;
    } catch {
      /* treated as no prep pack */
    }
  }
  if (incoming.length === 0) {
    return NextResponse.json({ error: "Interview has no prep pack questions" }, { status: 400 });
  }

  const Q = schema.interviewQuestions;
  const scope = and(eq(Q.userId, user.id), or(isNull(Q.applicationId), eq(Q.applicationId, appId)));
  const existing = await db.select({ text: Q.text }).from(Q).where(scope);
  const fresh = dedupeImports(existing.map((e) => e.text), incoming);
  if (fresh.length > 0) {
    const [m] = await db
      .select({ m: max(Q.sortOrder) })
      .from(Q)
      .where(and(eq(Q.userId, user.id), eq(Q.applicationId, appId)));
    const start = (m?.m ?? -1) + 1;
    await db
      .insert(Q)
      .values(fresh.map((text, i) => ({ userId: user.id, applicationId: appId, text, sortOrder: start + i })));
  }
  return NextResponse.json({ added: fresh.length });
}
