import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { normalizeQuestion } from "@/lib/interview-questions";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = parseInt((await ctx.params).id, 10);
  const body = await req.json().catch(() => ({}));
  const update: { text?: string; sortOrder?: number } = {};
  if (body.text !== undefined) {
    const t = normalizeQuestion(body.text);
    if (!t) return NextResponse.json({ error: "Invalid question text" }, { status: 400 });
    update.text = t;
  }
  if (body.sortOrder !== undefined) {
    if (!Number.isInteger(body.sortOrder)) {
      return NextResponse.json({ error: "sortOrder must be an integer" }, { status: 400 });
    }
    update.sortOrder = body.sortOrder;
  }
  const where = and(eq(schema.interviewQuestions.id, id), eq(schema.interviewQuestions.userId, user.id));
  const cols = {
    id: schema.interviewQuestions.id,
    text: schema.interviewQuestions.text,
    sortOrder: schema.interviewQuestions.sortOrder,
  };
  const rows =
    Object.keys(update).length === 0
      ? await db.select(cols).from(schema.interviewQuestions).where(where)
      : await db.update(schema.interviewQuestions).set(update).where(where).returning(cols);
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = parseInt((await ctx.params).id, 10);
  const deleted = await db
    .delete(schema.interviewQuestions)
    .where(and(eq(schema.interviewQuestions.id, id), eq(schema.interviewQuestions.userId, user.id)))
    .returning({ id: schema.interviewQuestions.id });
  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
