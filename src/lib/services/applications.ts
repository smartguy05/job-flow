import { db, schema } from "@/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { normalizeCompany } from "@/lib/dedup";
import { logEvent } from "@/lib/events";
import { detailFields } from "@/lib/application-fields";
import { getSettings } from "@/lib/settings";
import { expireStaleApplications } from "@/lib/expiry";
import { createJobFromApplication } from "@/lib/jobs";
import { NotFoundError, ValidationError } from "./errors";

// Loosely-typed input (an API body or an MCP tool's arguments). Field handling mirrors the
// historical route behavior exactly.
export type ApplicationInput = Record<string, unknown>;

const scope = (userId: string, id: number) =>
  and(eq(schema.applications.id, id), eq(schema.applications.userId, userId));

async function getOwnedApplication(userId: string, id: number) {
  if (!Number.isFinite(id)) return null;
  const [app] = await db.select().from(schema.applications).where(scope(userId, id)).limit(1);
  return app ?? null;
}

// All of a user's applications (most recently active first) with their contact and a
// resume count. Lazily expires stale applications first so the list reflects expiry even
// without the cron.
export async function listApplications(userId: string) {
  const s = await getSettings(userId);
  await expireStaleApplications(userId, s.expireApplicationsAfterDays);

  const apps = await db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.userId, userId))
    .orderBy(desc(schema.applications.lastActivityAt));
  const contacts = await db.select().from(schema.contacts).where(eq(schema.contacts.userId, userId));
  const contactMap = new Map(contacts.map((c) => [c.id, c]));
  // Count resumes without pulling the DOCX/PDF blobs into memory.
  const resumeRows = await db
    .select({ applicationId: schema.resumes.applicationId })
    .from(schema.resumes)
    .where(eq(schema.resumes.userId, userId));
  const resumeCount = new Map<number, number>();
  for (const r of resumeRows) resumeCount.set(r.applicationId, (resumeCount.get(r.applicationId) ?? 0) + 1);

  return apps.map((a) => ({
    ...a,
    contact: a.contactId ? contactMap.get(a.contactId) ?? null : null,
    resumeCount: resumeCount.get(a.id) ?? 0,
  }));
}

// Create an application (plus an inline contact when `contactName` is given). Company is
// optional — recruiters often withhold it — and is stored as "" until known.
export async function createApplication(userId: string, body: ApplicationInput): Promise<{ id: number }> {
  const roleTitle = body.roleTitle as string | undefined;
  if (!roleTitle) throw new ValidationError("roleTitle is required");
  const company = (body.company as string | undefined) ?? "";

  let contactId = (body.contactId as number | null | undefined) ?? null;
  // A supplied contactId must belong to this user.
  if (contactId) {
    const [owned] = await db
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.userId, userId)))
      .limit(1);
    if (!owned) contactId = null;
  }
  if (!contactId && body.contactName) {
    const [c] = await db
      .insert(schema.contacts)
      .values({
        userId,
        name: body.contactName as string,
        agency: (body.contactAgency as string | undefined) ?? null,
        email: (body.contactEmail as string | undefined) ?? null,
      })
      .returning({ id: schema.contacts.id });
    contactId = c.id;
  }

  const [app] = await db
    .insert(schema.applications)
    .values({
      userId,
      company,
      companyNormalized: normalizeCompany(company),
      roleTitle,
      link: (body.link as string | undefined) ?? null,
      sourceRaw: (body.sourceRaw as string | undefined) ?? null,
      jdSnapshot: (body.jdSnapshot as string | undefined) ?? null,
      contactId,
      status: (body.status as string | undefined) ?? "applied",
      notes: (body.notes as string | undefined) ?? null,
      appliedAt: body.appliedAt ? new Date(body.appliedAt as string) : body.markApplied ? new Date() : null,
      ...detailFields(body),
    })
    .returning({ id: schema.applications.id });

  await logEvent(userId, app.id, "created", `${company || "(company TBD)"} — ${roleTitle}`);
  return { id: app.id };
}

// Full detail for one application: contact, resume summaries (never the blobs), interviews,
// drafts, events, file metadata and the linked job id.
export async function getApplicationDetail(userId: string, id: number) {
  const app = await getOwnedApplication(userId, id);
  if (!app) throw new NotFoundError();

  const contact = app.contactId
    ? (
        await db
          .select()
          .from(schema.contacts)
          .where(and(eq(schema.contacts.id, app.contactId), eq(schema.contacts.userId, userId)))
          .limit(1)
      )[0] ?? null
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
    .where(and(eq(schema.resumes.applicationId, id), eq(schema.resumes.userId, userId)))
    .orderBy(desc(schema.resumes.version));
  const interviews = await db
    .select()
    .from(schema.interviews)
    .where(and(eq(schema.interviews.applicationId, id), eq(schema.interviews.userId, userId)))
    .orderBy(asc(schema.interviews.scheduledAt));
  const drafts = await db
    .select()
    .from(schema.messageDrafts)
    .where(and(eq(schema.messageDrafts.applicationId, id), eq(schema.messageDrafts.userId, userId)))
    .orderBy(desc(schema.messageDrafts.createdAt));
  const events = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.applicationId, id), eq(schema.events.userId, userId)))
    .orderBy(desc(schema.events.createdAt));
  // File metadata only — the bytea payload is served by the files download route.
  const files = await db
    .select({
      id: schema.applicationFiles.id,
      kind: schema.applicationFiles.kind,
      name: schema.applicationFiles.name,
      mimeType: schema.applicationFiles.mimeType,
      size: schema.applicationFiles.size,
      createdAt: schema.applicationFiles.createdAt,
    })
    .from(schema.applicationFiles)
    .where(and(eq(schema.applicationFiles.applicationId, id), eq(schema.applicationFiles.userId, userId)))
    .orderBy(desc(schema.applicationFiles.createdAt));

  const [job] = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.applicationId, id), eq(schema.jobs.userId, userId)))
    .limit(1);

  return {
    ...app,
    contact,
    resumes: resumes.map((r) => ({
      id: r.id,
      version: r.version,
      status: r.status,
      pageCount: r.pageCount,
      fitWarning: r.fitWarning,
      sentAt: r.sentAt,
      createdAt: r.createdAt,
      hasDocx: !!r.hasDocx,
      hasPdf: !!r.hasPdf,
    })),
    interviews,
    drafts,
    events,
    files,
    jobId: job?.id ?? null,
  };
}

// Partial update. A status change logs a `status_change` event, backfills `appliedAt` when
// moving past "applied", and turns a `closed_won` application into a tracked job
// (idempotent). Any other edit just bumps `lastActivityAt`.
export async function updateApplication(userId: string, id: number, body: ApplicationInput): Promise<void> {
  const existing = await getOwnedApplication(userId, id);
  if (!existing) throw new NotFoundError();

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.company !== undefined) {
    update.company = body.company;
    update.companyNormalized = normalizeCompany(body.company as string);
  }
  for (const f of ["roleTitle", "link", "notes", "jdSnapshot"]) {
    if (body[f] !== undefined) update[f] = body[f];
  }
  if (body.contactId !== undefined) update.contactId = body.contactId;
  if (body.appliedAt !== undefined) update.appliedAt = body.appliedAt ? new Date(body.appliedAt as string) : null;
  Object.assign(update, detailFields(body));

  const statusChanged = body.status !== undefined && body.status !== existing.status;
  if (statusChanged) {
    update.status = body.status;
    if (!existing.appliedAt && body.status !== "applied") update.appliedAt = new Date();
  }

  await db.update(schema.applications).set(update).where(scope(userId, id));

  if (statusChanged) {
    await logEvent(userId, id, "status_change", `${existing.status} → ${body.status}`);
    // A won application becomes a tracked job (idempotent: one job per application).
    if (body.status === "closed_won") {
      await createJobFromApplication(userId, { ...existing, ...update } as typeof existing);
    }
  } else {
    await db.update(schema.applications).set({ lastActivityAt: new Date() }).where(scope(userId, id));
  }
}

// Delete an application; FK cascades remove its children.
export async function deleteApplication(userId: string, id: number): Promise<void> {
  const deleted = await db
    .delete(schema.applications)
    .where(scope(userId, id))
    .returning({ id: schema.applications.id });
  if (deleted.length === 0) throw new NotFoundError();
}
