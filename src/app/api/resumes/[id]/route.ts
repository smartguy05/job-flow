import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { rerenderResume } from "@/lib/resume-service";
import { ResumeContentSchema } from "@/lib/resume-content";
import { logEvent } from "@/lib/events";
import { getUser, unauthorized } from "@/lib/auth";

async function getId(ctx: { params: Promise<{ id: string }> }) {
  return parseInt((await ctx.params).id, 10);
}

// Select the resume without its bytea blobs for JSON responses.
const resumeMeta = {
  id: schema.resumes.id,
  userId: schema.resumes.userId,
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

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = await getId(ctx);
  const [r] = await db
    .select(resumeMeta)
    .from(schema.resumes)
    .where(and(eq(schema.resumes.id, id), eq(schema.resumes.userId, user.id)))
    .limit(1);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...r, content: JSON.parse(r.contentJson), chat: JSON.parse(r.chatJson) });
}

// Save edited content (re-render), finalize, or mark as sent.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = await getId(ctx);
  const [r] = await db
    .select(resumeMeta)
    .from(schema.resumes)
    .where(and(eq(schema.resumes.id, id), eq(schema.resumes.userId, user.id)))
    .limit(1);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();

  try {
    if (body.content) {
      const content = ResumeContentSchema.parse(body.content);
      await rerenderResume(user.id, id, content);
    }
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status) update.status = body.status;
    if (body.markSent) {
      update.sentAt = new Date();
      update.status = "final";
    }
    if (Object.keys(update).length > 1) {
      await db
        .update(schema.resumes)
        .set(update)
        .where(and(eq(schema.resumes.id, id), eq(schema.resumes.userId, user.id)));
    }
    if (body.status === "final") await logEvent(user.id, r.applicationId, "resume_final", `v${r.version} finalized`);
    if (body.markSent) await logEvent(user.id, r.applicationId, "resume_sent", `v${r.version} sent`);

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
