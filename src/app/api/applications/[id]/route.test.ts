import { describe, it, expect } from "vitest";
import { GET, PATCH, DELETE } from "./route";
import { req, anonReq, ctx, insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

describe("GET /api/applications/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const id = await insertApp();
    const res = await GET(anonReq(`/api/applications/${id}`), ctx(id));
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await GET(req("/api/applications/999"), ctx(999));
    expect(res.status).toBe(404);
  });

  it("returns 404 for an application owned by another user", async () => {
    const other = await seedUser("other-user-sub");
    const id = await insertApp({ userId: other.id });
    const res = await GET(req(`/api/applications/${id}`), ctx(id));
    expect(res.status).toBe(404);
  });

  it("returns the application with related collections", async () => {
    const id = await insertApp();
    await db
      .insert(schema.resumes)
      .values({ userId: globalThis.__testUserId, applicationId: id, version: 1, status: "draft", contentJson: "{}", chatJson: "[]", pageCount: 2 });
    await db.insert(schema.interviews).values({ userId: globalThis.__testUserId, applicationId: id, round: "Screen" });

    const res = await GET(req(`/api/applications/${id}`), ctx(id));
    const body = await res.json();
    expect(body.id).toBe(id);
    expect(body.resumes).toHaveLength(1);
    expect(body.resumes[0].version).toBe(1);
    // full content blob is not shipped in the summary
    expect(body.resumes[0].contentJson).toBeUndefined();
    expect(body.interviews).toHaveLength(1);
  });
});

describe("PATCH /api/applications/[id]", () => {
  it("changes status and logs a status_change event", async () => {
    const id = await insertApp({ status: "applied" });
    const res = await PATCH(req(`/api/applications/${id}`, "PATCH", { status: "in_progress" }), ctx(id));
    expect(res.status).toBe(200);
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
    expect(app.status).toBe("in_progress");
    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, id));
    expect(events.some((e) => e.type === "status_change" && e.detail === "applied → in_progress")).toBe(true);
  });

  it("updates notes without a status event", async () => {
    const id = await insertApp();
    await PATCH(req(`/api/applications/${id}`, "PATCH", { notes: "called back" }), ctx(id));
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
    expect(app.notes).toBe("called back");
  });

  it("re-normalizes company when the name changes", async () => {
    const id = await insertApp();
    await PATCH(req(`/api/applications/${id}`, "PATCH", { company: "Initech LLC" }), ctx(id));
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
    expect(app.companyNormalized).toBe("initech");
  });

  it("updates rich detail + personal-tracking fields, coercing dates", async () => {
    const id = await insertApp();
    await PATCH(
      req(`/api/applications/${id}`, "PATCH", {
        payMin: 150000,
        payMax: 175000,
        techStack: "Go, Postgres",
        interestRating: 4,
        pros: "remote",
        cons: "commute",
        nextAction: "schedule call",
        nextActionDate: "2026-08-01",
      }),
      ctx(id),
    );
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
    expect(app.payMin).toBe(150000);
    expect(app.techStack).toBe("Go, Postgres");
    expect(app.interestRating).toBe(4);
    expect(app.nextActionDate).toBeInstanceOf(Date);
  });

  it("clears a date field when passed null", async () => {
    const id = await insertApp({ nextActionDate: new Date() });
    await PATCH(req(`/api/applications/${id}`, "PATCH", { nextActionDate: null }), ctx(id));
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
    expect(app.nextActionDate).toBeNull();
  });

  it("sets appliedAt from an explicit date", async () => {
    const id = await insertApp({ appliedAt: null });
    await PATCH(req(`/api/applications/${id}`, "PATCH", { appliedAt: "2026-03-01" }), ctx(id));
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
    expect(app.appliedAt).toBeInstanceOf(Date);
    expect(app.appliedAt!.toISOString().slice(0, 10)).toBe("2026-03-01");
  });

  it("clears appliedAt when passed null", async () => {
    const id = await insertApp({ appliedAt: new Date() });
    await PATCH(req(`/api/applications/${id}`, "PATCH", { appliedAt: null }), ctx(id));
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
    expect(app.appliedAt).toBeNull();
  });
});

describe("DELETE /api/applications/[id]", () => {
  it("removes the application and its children", async () => {
    const id = await insertApp();
    await db
      .insert(schema.resumes)
      .values({ userId: globalThis.__testUserId, applicationId: id, version: 1, status: "draft", contentJson: "{}", chatJson: "[]" });
    await db.insert(schema.interviews).values({ userId: globalThis.__testUserId, applicationId: id, round: "Screen" });

    await DELETE(req(`/api/applications/${id}`, "DELETE"), ctx(id));
    expect(await db.select().from(schema.applications).where(eq(schema.applications.id, id))).toHaveLength(0);
    expect(await db.select().from(schema.resumes).where(eq(schema.resumes.applicationId, id))).toHaveLength(0);
    expect(await db.select().from(schema.interviews).where(eq(schema.interviews.applicationId, id))).toHaveLength(0);
  });
});
