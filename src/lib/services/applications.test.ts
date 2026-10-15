import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { insertApp, seedUser } from "@/test/req";
import { NotFoundError, ValidationError } from "./errors";
import {
  listApplications,
  createApplication,
  getApplicationDetail,
  updateApplication,
  deleteApplication,
} from "./applications";

const uid = () => globalThis.__testUserId;
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe("createApplication", () => {
  it("requires a roleTitle", async () => {
    await expect(createApplication(uid(), { company: "X" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createApplication(uid(), {})).rejects.toThrow("roleTitle is required");
  });

  it("creates with normalized company, a created event and an inline contact", async () => {
    const { id } = await createApplication(uid(), {
      company: "Acme Inc.",
      roleTitle: "Platform Engineer",
      contactName: "Rita Recruiter",
      contactEmail: "rita@agency.test",
      markApplied: true,
    });
    const detail = await getApplicationDetail(uid(), id);
    expect(detail.companyNormalized).toBe("acme");
    expect(detail.status).toBe("applied");
    expect(detail.appliedAt).toBeInstanceOf(Date);
    expect(detail.contact?.name).toBe("Rita Recruiter");
    expect(detail.events.map((e) => e.type)).toContain("created");
  });

  it("defaults company to empty and ignores a contactId owned by someone else", async () => {
    const other = await seedUser("apps-svc-contact-owner");
    const [c] = await db
      .insert(schema.contacts)
      .values({ userId: other.id, name: "Not yours" })
      .returning({ id: schema.contacts.id });
    const { id } = await createApplication(uid(), { roleTitle: "SRE", contactId: c.id });
    const detail = await getApplicationDetail(uid(), id);
    expect(detail.company).toBe("");
    expect(detail.contactId).toBeNull();
  });
});

describe("listApplications", () => {
  it("returns only the user's apps with contact + resume count, and lazily expires stale ones", async () => {
    const other = await seedUser("apps-svc-list-other");
    const mine = await insertApp({ roleTitle: "Listed" });
    const stale = await insertApp({ roleTitle: "Stale", lastActivityAt: daysAgo(400) });
    await db.insert(schema.applications).values({
      userId: other.id,
      company: "Theirs",
      companyNormalized: "theirs",
      roleTitle: "Hidden",
    });
    await db.insert(schema.resumes).values({ userId: uid(), applicationId: mine, version: 1, contentJson: "{}" });

    const rows = await listApplications(uid());
    expect(rows.find((r) => r.roleTitle === "Hidden")).toBeUndefined();
    const listed = rows.find((r) => r.id === mine)!;
    expect(listed.resumeCount).toBe(1);
    expect(listed.contact).toBeNull();
    expect(rows.find((r) => r.id === stale)!.status).toBe("expired");
  });
});

describe("getApplicationDetail", () => {
  it("throws NotFoundError for another user's application", async () => {
    const other = await seedUser("apps-svc-detail-other");
    const id = await insertApp();
    await expect(getApplicationDetail(other.id, id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("summarizes resumes without blobs", async () => {
    const id = await insertApp();
    await db.insert(schema.resumes).values({
      userId: uid(),
      applicationId: id,
      version: 1,
      contentJson: "{}",
      pdfData: Buffer.from("pdf"),
      variantLabel: "ML-heavy",
    });
    const detail = await getApplicationDetail(uid(), id);
    expect(detail.resumes).toHaveLength(1);
    expect(detail.resumes[0]).toMatchObject({ version: 1, hasPdf: true, hasDocx: false, variantLabel: "ML-heavy" });
    expect(detail.resumes[0]).not.toHaveProperty("pdfData");
    expect(detail.jobId).toBeNull();
  });
});

describe("updateApplication", () => {
  it("logs a status change, backfills appliedAt and creates a job on closed_won", async () => {
    const id = await insertApp({ status: "applied", appliedAt: null });
    await updateApplication(uid(), id, { status: "in_progress" });
    let detail = await getApplicationDetail(uid(), id);
    expect(detail.status).toBe("in_progress");
    expect(detail.appliedAt).toBeInstanceOf(Date);
    expect(detail.events.some((e) => e.type === "status_change" && e.detail === "applied → in_progress")).toBe(true);

    await updateApplication(uid(), id, { status: "closed_won" });
    detail = await getApplicationDetail(uid(), id);
    expect(detail.jobId).not.toBeNull();
  });

  it("updates plain fields and bumps lastActivityAt without an event", async () => {
    const id = await insertApp({ lastActivityAt: daysAgo(5) });
    await updateApplication(uid(), id, { company: "New Co LLC", notes: "hi" });
    const [row] = await db.select().from(schema.applications).where(eq(schema.applications.id, id));
    expect(row.company).toBe("New Co LLC");
    expect(row.companyNormalized).toBe("new");
    expect(row.notes).toBe("hi");
    expect(row.lastActivityAt.getTime()).toBeGreaterThan(daysAgo(1).getTime());
  });

  it("rejects a contactId owned by another user and keeps the existing contact", async () => {
    const other = await seedUser("apps-svc-update-contact-owner");
    const [foreign] = await db
      .insert(schema.contacts)
      .values({ userId: other.id, name: "Not yours" })
      .returning({ id: schema.contacts.id });
    const [mine] = await db
      .insert(schema.contacts)
      .values({ userId: uid(), name: "Mine" })
      .returning({ id: schema.contacts.id });
    const id = await insertApp({ contactId: mine.id });
    await expect(updateApplication(uid(), id, { contactId: foreign.id })).rejects.toBeInstanceOf(ValidationError);
    const [row] = await db.select().from(schema.applications).where(eq(schema.applications.id, id));
    expect(row.contactId).toBe(mine.id);
    // Own contacts and clearing still work.
    await updateApplication(uid(), id, { contactId: null });
    const [cleared] = await db.select().from(schema.applications).where(eq(schema.applications.id, id));
    expect(cleared.contactId).toBeNull();
    await updateApplication(uid(), id, { contactId: mine.id });
    const [set] = await db.select().from(schema.applications).where(eq(schema.applications.id, id));
    expect(set.contactId).toBe(mine.id);
  });

  it("throws NotFoundError across tenants and leaves the row untouched", async () => {
    const other = await seedUser("apps-svc-update-other");
    const id = await insertApp({ notes: "orig" });
    await expect(updateApplication(other.id, id, { notes: "hacked" })).rejects.toBeInstanceOf(NotFoundError);
    const [row] = await db.select().from(schema.applications).where(eq(schema.applications.id, id));
    expect(row.notes).toBe("orig");
  });
});

describe("deleteApplication", () => {
  it("deletes only the owner's application", async () => {
    const other = await seedUser("apps-svc-delete-other");
    const id = await insertApp();
    await expect(deleteApplication(other.id, id)).rejects.toBeInstanceOf(NotFoundError);
    await deleteApplication(uid(), id);
    const rows = await db
      .select()
      .from(schema.applications)
      .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, uid())));
    expect(rows).toHaveLength(0);
  });
});
