import { describe, it, expect } from "vitest";
import { GET, POST } from "./route";
import { req } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

describe("POST /api/applications", () => {
  it("requires roleTitle", async () => {
    const res = await POST(req("/api/applications", "POST", { company: "X" }));
    expect(res.status).toBe(400);
  });

  it("allows an application with no company yet (recruiter hasn't disclosed it)", async () => {
    const res = await POST(req("/api/applications", "POST", { roleTitle: "Senior Engineer" }));
    expect(res.status).toBe(200);
    const { id } = await res.json();
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
    expect(app.roleTitle).toBe("Senior Engineer");
    expect(app.company).toBe("");
    expect(app.companyNormalized).toBe("");
  });

  it("creates an application and auto-creates a contact from contactName", async () => {
    const res = await POST(
      req("/api/applications", "POST", {
        company: "Acme, Inc.",
        roleTitle: "Senior Engineer",
        contactName: "Sarah",
        contactAgency: "TalentBridge",
        markApplied: true,
      }),
    );
    const { id } = await res.json();
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
    expect(app.companyNormalized).toBe("acme");
    expect(app.appliedAt).not.toBeNull();
    expect(app.contactId).not.toBeNull();
    const [contact] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, app.contactId!)).limit(1);
    expect(contact.name).toBe("Sarah");
    // creation is logged
    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, id));
    expect(events.some((e) => e.type === "created")).toBe(true);
  });

  it("leaves appliedAt null when markApplied is not set", async () => {
    const res = await POST(req("/api/applications", "POST", { company: "Z", roleTitle: "Dev" }));
    const { id } = await res.json();
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
    expect(app.appliedAt).toBeNull();
  });

  it("persists the rich detail fields and coerces date strings", async () => {
    const res = await POST(
      req("/api/applications", "POST", {
        company: "Globex",
        roleTitle: "Senior AI Engineer",
        payMin: 180000,
        payMax: 220000,
        payCurrency: "USD",
        payPeriod: "year",
        bonus: "15% target",
        benefits: "health, 401k",
        locationMode: "remote",
        location: "US",
        employmentType: "full-time",
        seniorityLevel: "Senior",
        techStack: "TypeScript, Python",
        companySize: "500-1000",
        companyStage: "Series C",
        industry: "Dev tools",
        sourceChannel: "recruiter",
        datePosted: "2026-07-01",
        postingId: "REQ-123",
        referralName: "Dana",
        interestRating: 5,
        pros: "great stack",
        cons: "unknown pay ceiling",
        nextAction: "reply to recruiter",
        nextActionDate: "2026-07-10",
      }),
    );
    const { id } = await res.json();
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
    expect(app.payMin).toBe(180000);
    expect(app.payMax).toBe(220000);
    expect(app.techStack).toBe("TypeScript, Python");
    expect(app.locationMode).toBe("remote");
    expect(app.interestRating).toBe(5);
    expect(app.sourceChannel).toBe("recruiter");
    expect(app.datePosted).toBeInstanceOf(Date);
    expect(app.nextActionDate).toBeInstanceOf(Date);
  });
});

describe("GET /api/applications", () => {
  it("lists applications with contact and resume count", async () => {
    const create = await POST(
      req("/api/applications", "POST", { company: "Globex", roleTitle: "AI Eng", contactName: "Sarah" }),
    );
    const { id } = await create.json();
    await db
      .insert(schema.resumes)
      .values({ userId: globalThis.__testUserId, applicationId: id, version: 1, status: "draft", contentJson: "{}", chatJson: "[]" });

    const res = await GET(req("/api/applications"));
    const list = await res.json();
    expect(Array.isArray(list)).toBe(true);
    const row = list.find((a: { id: number }) => a.id === id);
    expect(row.contact.name).toBe("Sarah");
    expect(row.resumeCount).toBe(1);
  });
});
