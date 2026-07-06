import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq, and } from "drizzle-orm";
import { normalizeCompany } from "@/lib/dedup";
import { logEvent } from "@/lib/events";
import { detailFields } from "@/lib/application-fields";
import { getUser, unauthorized } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const apps = await db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.userId, user.id))
    .orderBy(desc(schema.applications.lastActivityAt));
  const contacts = await db.select().from(schema.contacts).where(eq(schema.contacts.userId, user.id));
  const contactMap = new Map(contacts.map((c) => [c.id, c]));
  // Count resumes without pulling the DOCX/PDF blobs into memory.
  const resumeRows = await db
    .select({ applicationId: schema.resumes.applicationId })
    .from(schema.resumes)
    .where(eq(schema.resumes.userId, user.id));
  const resumeCount = new Map<number, number>();
  for (const r of resumeRows) resumeCount.set(r.applicationId, (resumeCount.get(r.applicationId) ?? 0) + 1);

  return NextResponse.json(
    apps.map((a) => ({
      ...a,
      contact: a.contactId ? contactMap.get(a.contactId) ?? null : null,
      resumeCount: resumeCount.get(a.id) ?? 0,
    })),
  );
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const roleTitle = body.roleTitle;
  if (!roleTitle) {
    return NextResponse.json({ error: "roleTitle is required" }, { status: 400 });
  }
  // Company is optional — recruiters often withhold it until later. Stored as "" until known.
  const company: string = body.company ?? "";

  let contactId: number | null = body.contactId ?? null;
  // A supplied contactId must belong to this user.
  if (contactId) {
    const [owned] = await db
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.userId, user.id)))
      .limit(1);
    if (!owned) contactId = null;
  }
  if (!contactId && body.contactName) {
    const [c] = await db
      .insert(schema.contacts)
      .values({
        userId: user.id,
        name: body.contactName,
        agency: body.contactAgency ?? null,
        email: body.contactEmail ?? null,
      })
      .returning({ id: schema.contacts.id });
    contactId = c.id;
  }

  const [app] = await db
    .insert(schema.applications)
    .values({
      userId: user.id,
      company,
      companyNormalized: normalizeCompany(company),
      roleTitle,
      link: body.link ?? null,
      sourceRaw: body.sourceRaw ?? null,
      jdSnapshot: body.jdSnapshot ?? null,
      contactId,
      status: body.status ?? "applied",
      notes: body.notes ?? null,
      appliedAt: body.markApplied ? new Date() : null,
      ...detailFields(body),
    })
    .returning({ id: schema.applications.id });

  await logEvent(user.id, app.id, "created", `${company || "(company TBD)"} — ${roleTitle}`);
  return NextResponse.json({ id: app.id });
}
