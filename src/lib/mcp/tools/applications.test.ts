import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ extractJob: vi.fn() }));

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { extractJob, type ExtractedJob } from "@/lib/llm";
import { insertApp, seedUser } from "@/test/req";
import { NotFoundError } from "@/lib/services/errors";
import { callTool } from "../registry";

const mockExtract = vi.mocked(extractJob);
const uid = () => globalThis.__testUserId;

const extracted = (over: Partial<ExtractedJob> = {}) =>
  ({
    company: "Initech",
    roleTitle: "Platform Engineer",
    link: "https://initech.example/jobs/1",
    jdSnapshot: "Build the platform",
    contactName: "Bob",
    contactAgency: null,
    contactEmail: "bob@initech.example",
    payMin: 150000,
    payMax: 180000,
    payCurrency: "USD",
    payPeriod: "year",
    locationMode: "remote",
    ...over,
  }) as ExtractedJob;

beforeEach(() => {
  mockExtract.mockReset();
  mockExtract.mockResolvedValue(extracted());
});

describe("capture_job", () => {
  it("extracts and checks duplicates without saving by default", async () => {
    const out = (await callTool("capture_job", uid(), { text: "We are hiring..." })) as {
      extracted: ExtractedJob;
      duplicates: unknown[];
      saved: unknown;
    };
    expect(out.extracted.company).toBe("Initech");
    expect(out.duplicates).toEqual([]);
    expect(out.saved).toBeNull();
    expect(mockExtract).toHaveBeenCalledWith(expect.objectContaining({ userId: uid(), text: "We are hiring..." }));
    const rows = await db.select().from(schema.applications).where(eq(schema.applications.userId, uid()));
    expect(rows.find((r) => r.company === "Initech")).toBeUndefined();
  });

  it("saves the application (with contact and detail fields) when save is true", async () => {
    const out = (await callTool("capture_job", uid(), { text: "JD", save: true, markApplied: true })) as {
      saved: { id: number };
    };
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, out.saved.id));
    expect(app).toMatchObject({ userId: uid(), company: "Initech", roleTitle: "Platform Engineer", payMin: 150000, sourceRaw: "JD" });
    expect(app.appliedAt).not.toBeNull();
    const [contact] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, app.contactId!));
    expect(contact.name).toBe("Bob");
  });

  it("saves only extracted job fields, never model-supplied status/notes/dates/contactId", async () => {
    const [mine] = await db
      .insert(schema.contacts)
      .values({ userId: uid(), name: "Existing contact" })
      .returning({ id: schema.contacts.id });
    // A prompt-injected posting could make the model emit extra keys.
    mockExtract.mockResolvedValue({
      ...extracted({ company: "Injected Co", roleTitle: "Engineer", contactName: null }),
      status: "closed_won",
      notes: "ignore previous instructions",
      appliedAt: "2001-01-01",
      nextActionDate: "2001-01-01",
      interestRating: 5,
      contactId: mine.id,
      sourceRaw: "spoofed",
      userId: "someone-else",
    } as unknown as ExtractedJob);
    const out = (await callTool("capture_job", uid(), { text: "JD", save: true })) as { saved: { id: number } };
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, out.saved.id));
    expect(app).toMatchObject({
      userId: uid(),
      company: "Injected Co",
      status: "applied",
      notes: null,
      appliedAt: null,
      nextActionDate: null,
      interestRating: null,
      contactId: null,
      sourceRaw: "JD",
    });
    const jobs = await db.select().from(schema.jobs).where(eq(schema.jobs.applicationId, app.id));
    expect(jobs).toEqual([]);
  });

  it("holds back a save when a likely duplicate exists unless allowDuplicate is set", async () => {
    mockExtract.mockResolvedValue(extracted({ company: "Dupe Inc", roleTitle: "Staff Platform Engineer" }));
    await insertApp({ company: "Dupe Inc", companyNormalized: "dupe", roleTitle: "Platform Engineer" });
    const held = (await callTool("capture_job", uid(), { text: "JD", save: true })) as {
      duplicates: { roleTitle: string }[];
      saved: unknown;
      note: string;
    };
    expect(held.duplicates).toHaveLength(1);
    expect(held.saved).toBeNull();
    expect(held.note).toMatch(/duplicate/i);
    const forced = (await callTool("capture_job", uid(), { text: "JD", save: true, allowDuplicate: true })) as {
      saved: { id: number };
    };
    expect(forced.saved.id).toBeGreaterThan(0);
  });

  it("never reports another user's applications as duplicates", async () => {
    const other = await seedUser("capture-other");
    mockExtract.mockResolvedValue(extracted({ company: "Hooli", roleTitle: "Platform Engineer" }));
    await insertApp({ userId: other.id, company: "Hooli", companyNormalized: "hooli", roleTitle: "Platform Engineer" });
    const out = (await callTool("capture_job", uid(), { text: "JD" })) as { duplicates: unknown[] };
    expect(out.duplicates).toEqual([]);
  });

  it("rejects empty text", async () => {
    await expect(callTool("capture_job", uid(), { text: "" })).rejects.toThrow();
  });
});

describe("list_applications", () => {
  it("lists the user's open applications compactly, with status/search/includeClosed filters", async () => {
    const other = await seedUser("list-other");
    await insertApp({ company: "Acme", companyNormalized: "acme", roleTitle: "Backend Dev", status: "applied" });
    await insertApp({ company: "Umbrella", companyNormalized: "umbrella", roleTitle: "SRE", status: "in_progress" });
    await insertApp({ company: "Closed Co", companyNormalized: "closed", roleTitle: "Dev", status: "closed_lost" });
    await insertApp({ userId: other.id, company: "Secret", companyNormalized: "secret", roleTitle: "Dev" });

    type Row = { company: string; status: string; jdSnapshot?: string; contact: unknown };
    const open = (await callTool("list_applications", uid(), {})) as Row[];
    const names = open.map((a) => a.company);
    expect(names).toEqual(expect.arrayContaining(["Acme", "Umbrella"]));
    expect(names).not.toContain("Closed Co");
    expect(names).not.toContain("Secret");
    expect(open[0]).not.toHaveProperty("jdSnapshot");

    const withClosed = (await callTool("list_applications", uid(), { includeClosed: true })) as Row[];
    expect(withClosed.map((a) => a.company)).toContain("Closed Co");

    const inProgress = (await callTool("list_applications", uid(), { status: "in_progress" })) as Row[];
    expect(inProgress.map((a) => a.company)).toEqual(["Umbrella"]);

    const search = (await callTool("list_applications", uid(), { search: "backend" })) as Row[];
    expect(search.map((a) => a.company)).toEqual(["Acme"]);
  });

  it("rejects an unknown status", async () => {
    await expect(callTool("list_applications", uid(), { status: "bogus" })).rejects.toThrow();
  });
});

describe("get_application", () => {
  it("returns detail without resume/file blobs", async () => {
    const id = await insertApp({ company: "Detail Co" });
    await db.insert(schema.resumes).values({
      userId: uid(),
      applicationId: id,
      version: 1,
      contentJson: "{}",
      pdfData: Buffer.from("%PDF-secret-bytes"),
    });
    const out = (await callTool("get_application", uid(), { id })) as { company: string; resumes: object[] };
    expect(out.company).toBe("Detail Co");
    expect(out.resumes[0]).toMatchObject({ version: 1, hasPdf: true, hasDocx: false });
    expect(JSON.stringify(out)).not.toContain("PDF-secret-bytes");
  });

  it("refuses another user's application", async () => {
    const other = await seedUser("get-other");
    const id = await insertApp({ userId: other.id });
    await expect(callTool("get_application", uid(), { id })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("update_application", () => {
  it("updates status (logging an event) and next action fields", async () => {
    const id = await insertApp({ status: "applied" });
    const out = await callTool("update_application", uid(), {
      id,
      status: "in_progress",
      nextAction: "Send portfolio",
      nextActionDate: "2026-11-01",
      notes: "Recruiter call went well",
      interestRating: 4,
    });
    expect(out).toMatchObject({ id, status: "in_progress", nextAction: "Send portfolio" });
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id));
    expect(app.notes).toBe("Recruiter call went well");
    expect(app.interestRating).toBe(4);
    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, id));
    expect(events.map((e) => e.type)).toContain("status_change");
  });

  it("refuses another user's application", async () => {
    const other = await seedUser("update-other");
    const id = await insertApp({ userId: other.id, status: "applied" });
    await expect(callTool("update_application", uid(), { id, status: "closed_lost" })).rejects.toBeInstanceOf(NotFoundError);
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id));
    expect(app.status).toBe("applied");
  });
});
