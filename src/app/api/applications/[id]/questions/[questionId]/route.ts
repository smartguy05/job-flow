import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import type { ChecklistItem } from "@/lib/interview-questions";

type Ctx = { params: Promise<{ id: string; questionId: string }> };

// Upsert check state / notes for one question on one job.
export async function PUT(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const p = await ctx.params;
  const appId = parseInt(p.id, 10);
  const questionId = parseInt(p.questionId, 10);
  const body = await req.json().catch(() => ({}));
  if (body.checked !== undefined && typeof body.checked !== "boolean") {
    return NextResponse.json({ error: "checked must be a boolean" }, { status: 400 });
  }
  if (body.notes !== undefined && typeof body.notes !== "string") {
    return NextResponse.json({ error: "notes must be a string" }, { status: 400 });
  }

  const [app] = await db
    .select({ id: schema.applications.id })
    .from(schema.applications)
    .where(and(eq(schema.applications.id, appId), eq(schema.applications.userId, user.id)))
    .limit(1);
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const Q = schema.interviewQuestions;
  const [q] = await db
    .select()
    .from(Q)
    .where(and(eq(Q.id, questionId), eq(Q.userId, user.id)))
    .limit(1);
  if (!q || (q.applicationId !== null && q.applicationId !== appId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const S = schema.applicationQuestionState;
  const [existing] = await db
    .select()
    .from(S)
    .where(and(eq(S.applicationId, appId), eq(S.questionId, questionId)))
    .limit(1);
  const now = new Date();
  let checkedAt: Date | null = existing?.checkedAt ?? null;
  if (body.checked === true) checkedAt = existing?.checkedAt ?? now;
  else if (body.checked === false) checkedAt = null;
  const notes: string = body.notes !== undefined ? body.notes : (existing?.notes ?? "");

  const [row] = await db
    .insert(S)
    .values({ userId: user.id, applicationId: appId, questionId, checkedAt, notes, updatedAt: now })
    .onConflictDoUpdate({ target: [S.applicationId, S.questionId], set: { checkedAt, notes, updatedAt: now } })
    .returning();

  const item: ChecklistItem = {
    id: q.id,
    text: q.text,
    source: q.applicationId === null ? "general" : "job",
    checked: row.checkedAt !== null,
    checkedAt: row.checkedAt ? row.checkedAt.toISOString() : null,
    notes: row.notes,
  };
  return NextResponse.json({ item });
}
