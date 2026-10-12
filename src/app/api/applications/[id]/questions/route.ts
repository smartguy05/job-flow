import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { buildChecklist, normalizeQuestion } from "@/lib/interview-questions";
import { InterviewPrepSchema } from "@/lib/interview-prep-content";

type Ctx = { params: Promise<{ id: string }> };

async function ownedApp(userId: string, id: number) {
  const [app] = await db
    .select({ id: schema.applications.id, company: schema.applications.company, roleTitle: schema.applications.roleTitle })
    .from(schema.applications)
    .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, userId)))
    .limit(1);
  return app;
}

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const appId = parseInt((await ctx.params).id, 10);
  const app = await ownedApp(user.id, appId);
  if (!app) return notFound();

  const Q = schema.interviewQuestions;
  const cols = { id: Q.id, text: Q.text, sortOrder: Q.sortOrder, applicationId: Q.applicationId };
  const general = await db
    .select(cols)
    .from(Q)
    .where(and(eq(Q.userId, user.id), isNull(Q.applicationId)))
    .orderBy(asc(Q.sortOrder), asc(Q.id));
  const specific = await db
    .select(cols)
    .from(Q)
    .where(and(eq(Q.userId, user.id), eq(Q.applicationId, appId)))
    .orderBy(asc(Q.sortOrder), asc(Q.id));
  const S = schema.applicationQuestionState;
  const states = await db
    .select({ questionId: S.questionId, checkedAt: S.checkedAt, notes: S.notes })
    .from(S)
    .where(and(eq(S.userId, user.id), eq(S.applicationId, appId)));

  const ivs = await db
    .select()
    .from(schema.interviews)
    .where(and(eq(schema.interviews.userId, user.id), eq(schema.interviews.applicationId, appId)))
    .orderBy(asc(schema.interviews.scheduledAt), asc(schema.interviews.id));
  const prepPacks: { interviewId: number; round: string | null; scheduledAt: Date | null; count: number }[] = [];
  for (const iv of ivs) {
    if (!iv.prepPackJson) continue;
    let parsed;
    try {
      parsed = InterviewPrepSchema.safeParse(JSON.parse(iv.prepPackJson));
    } catch {
      continue;
    }
    if (!parsed.success || parsed.data.questionsToAsk.length === 0) continue;
    prepPacks.push({
      interviewId: iv.id,
      round: iv.round,
      scheduledAt: iv.scheduledAt,
      count: parsed.data.questionsToAsk.length,
    });
  }

  return NextResponse.json({
    application: app,
    items: buildChecklist(general, specific, states),
    prepPacks,
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const appId = parseInt((await ctx.params).id, 10);
  const app = await ownedApp(user.id, appId);
  if (!app) return notFound();
  const body = await req.json().catch(() => ({}));
  const text = normalizeQuestion(body?.text);
  if (!text) return NextResponse.json({ error: "Invalid question text" }, { status: 400 });
  const Q = schema.interviewQuestions;
  const [m] = await db
    .select({ m: max(Q.sortOrder) })
    .from(Q)
    .where(and(eq(Q.userId, user.id), eq(Q.applicationId, appId)));
  const [row] = await db
    .insert(Q)
    .values({ userId: user.id, applicationId: appId, text, sortOrder: (m?.m ?? -1) + 1 })
    .returning({ id: Q.id, text: Q.text, sortOrder: Q.sortOrder });
  return NextResponse.json(row, { status: 201 });
}

// Reset: uncheck everything for this job, keep notes.
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const appId = parseInt((await ctx.params).id, 10);
  const app = await ownedApp(user.id, appId);
  if (!app) return notFound();
  const S = schema.applicationQuestionState;
  await db
    .update(S)
    .set({ checkedAt: null, updatedAt: new Date() })
    .where(and(eq(S.userId, user.id), eq(S.applicationId, appId)));
  return NextResponse.json({ ok: true });
}
