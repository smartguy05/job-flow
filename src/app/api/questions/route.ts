import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";
import { normalizeQuestion } from "@/lib/interview-questions";

// General (cross-job) interview questions.
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const questions = await db
    .select({
      id: schema.interviewQuestions.id,
      text: schema.interviewQuestions.text,
      sortOrder: schema.interviewQuestions.sortOrder,
    })
    .from(schema.interviewQuestions)
    .where(and(eq(schema.interviewQuestions.userId, user.id), isNull(schema.interviewQuestions.applicationId)))
    .orderBy(asc(schema.interviewQuestions.sortOrder), asc(schema.interviewQuestions.id));
  return NextResponse.json({ questions });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const text = normalizeQuestion(body?.text);
  if (!text) return NextResponse.json({ error: "Invalid question text" }, { status: 400 });
  const [m] = await db
    .select({ m: max(schema.interviewQuestions.sortOrder) })
    .from(schema.interviewQuestions)
    .where(and(eq(schema.interviewQuestions.userId, user.id), isNull(schema.interviewQuestions.applicationId)));
  const sortOrder = (m?.m ?? -1) + 1;
  const [row] = await db
    .insert(schema.interviewQuestions)
    .values({ userId: user.id, text, sortOrder })
    .returning({
      id: schema.interviewQuestions.id,
      text: schema.interviewQuestions.text,
      sortOrder: schema.interviewQuestions.sortOrder,
    });
  return NextResponse.json(row, { status: 201 });
}
