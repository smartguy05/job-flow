import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { refineResumeContent } from "@/lib/llm";
import { rerenderResume } from "@/lib/resume-service";
import type { ChatMessage, ResumeContent } from "@/lib/resume-content";
import { getUser, unauthorized } from "@/lib/auth";

export const maxDuration = 300;

const resumeMeta = {
  id: schema.resumes.id,
  applicationId: schema.resumes.applicationId,
  version: schema.resumes.version,
  status: schema.resumes.status,
  contentJson: schema.resumes.contentJson,
  chatJson: schema.resumes.chatJson,
  pageCount: schema.resumes.pageCount,
  fitWarning: schema.resumes.fitWarning,
  sentAt: schema.resumes.sentAt,
  createdAt: schema.resumes.createdAt,
  updatedAt: schema.resumes.updatedAt,
};

// Apply free-text feedback: LLM edits the content, then we re-render + persist.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const id = parseInt((await ctx.params).id, 10);
    const { feedback } = await req.json();
    if (!feedback?.trim()) return NextResponse.json({ error: "feedback is required" }, { status: 400 });

    const [r] = await db
      .select(resumeMeta)
      .from(schema.resumes)
      .where(and(eq(schema.resumes.id, id), eq(schema.resumes.userId, user.id)))
      .limit(1);
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const [app] = await db
      .select()
      .from(schema.applications)
      .where(and(eq(schema.applications.id, r.applicationId), eq(schema.applications.userId, user.id)))
      .limit(1);

    const current: ResumeContent = JSON.parse(r.contentJson);
    const chat: ChatMessage[] = JSON.parse(r.chatJson);

    const updated = await refineResumeContent({
      userId: user.id,
      current,
      chat,
      feedback,
      job: { company: app.company, roleTitle: app.roleTitle, jdSnapshot: app.jdSnapshot || "" },
    });

    const newChat: ChatMessage[] = [
      ...chat,
      { role: "user", content: feedback },
      { role: "assistant", content: "Applied the requested changes." },
    ];
    await db
      .update(schema.resumes)
      .set({ chatJson: JSON.stringify(newChat) })
      .where(and(eq(schema.resumes.id, id), eq(schema.resumes.userId, user.id)));

    await rerenderResume(user.id, id, updated);

    const [fresh] = await db
      .select(resumeMeta)
      .from(schema.resumes)
      .where(and(eq(schema.resumes.id, id), eq(schema.resumes.userId, user.id)))
      .limit(1);
    return NextResponse.json({ ...fresh, content: JSON.parse(fresh.contentJson), chat: JSON.parse(fresh.chatJson) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
