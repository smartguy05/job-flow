import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { normalizeCompany } from "@/lib/dedup";
import { logEvent } from "@/lib/events";
import { detailFields } from "@/lib/application-fields";
import { getUser, unauthorized } from "@/lib/auth";

async function getId(ctx: { params: Promise<{ id: string }> }) {
  return parseInt((await ctx.params).id, 10);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = await getId(ctx);

  const [app] = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, user.id)))
    .limit(1);
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contact = app.contactId
    ? (await db.select().from(schema.contacts).where(eq(schema.contacts.id, app.contactId)).limit(1))[0] ?? null
    : null;
  // Project resume columns explicitly so the DOCX/PDF blobs never enter this payload.
  const resumes = await db
    .select({
      id: schema.resumes.id,
      version: schema.resumes.version,
      status: schema.resumes.status,
      pageCount: schema.resumes.pageCount,
      fitWarning: schema.resumes.fitWarning,
      sentAt: schema.resumes.sentAt,
      createdAt: schema.resumes.createdAt,
      hasDocx: schema.resumes.docxData,
      hasPdf: schema.resumes.pdfData,
    })
    .from(schema.resumes)
    .where(eq(schema.resumes.applicationId, id))
    .orderBy(desc(schema.resumes.version));
  const interviews = await db
    .select()
    .from(schema.interviews)
    .where(eq(schema.interviews.applicationId, id))
    .orderBy(asc(schema.interviews.scheduledAt));
  const drafts = await db
    .select()
    .from(schema.messageDrafts)
    .where(eq(schema.messageDrafts.applicationId, id))
    .orderBy(desc(schema.messageDrafts.createdAt));
  const events = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.applicationId, id))
    .orderBy(desc(schema.events.createdAt));

  const resumeSummaries = resumes.map((r) => ({
    id: r.id,
    version: r.version,
    status: r.status,
    pageCount: r.pageCount,
    fitWarning: r.fitWarning,
    sentAt: r.sentAt,
    createdAt: r.createdAt,
    hasDocx: !!r.hasDocx,
    hasPdf: !!r.hasPdf,
  }));

  return NextResponse.json({ ...app, contact, resumes: resumeSummaries, interviews, drafts, events });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = await getId(ctx);
  const body = await req.json();
  const [existing] = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, user.id)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.company !== undefined) {
    update.company = body.company;
    update.companyNormalized = normalizeCompany(body.company);
  }
  for (const f of ["roleTitle", "link", "notes", "jdSnapshot"]) {
    if (body[f] !== undefined) update[f] = body[f];
  }
  if (body.contactId !== undefined) update.contactId = body.contactId;
  if (body.appliedAt !== undefined) update.appliedAt = body.appliedAt ? new Date(body.appliedAt) : null;
  Object.assign(update, detailFields(body));

  if (body.status !== undefined && body.status !== existing.status) {
    update.status = body.status;
    if (body.status !== "applied" || existing.appliedAt == null) {
      if (!existing.appliedAt && body.status !== "applied") update.appliedAt = existing.appliedAt ?? new Date();
    }
  }

  await db
    .update(schema.applications)
    .set(update)
    .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, user.id)));

  if (body.status !== undefined && body.status !== existing.status) {
    await logEvent(user.id, id, "status_change", `${existing.status} → ${body.status}`);
  } else {
    await db
      .update(schema.applications)
      .set({ lastActivityAt: new Date() })
      .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, user.id)));
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = await getId(ctx);
  // FK cascades remove children; scope the delete to the owning user.
  const deleted = await db
    .delete(schema.applications)
    .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, user.id)))
    .returning({ id: schema.applications.id });
  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
