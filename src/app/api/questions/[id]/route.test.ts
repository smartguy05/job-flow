import { describe, it, expect } from "vitest";
import { PATCH, DELETE } from "./route";
import { req, anonReq, ctx, seedUser, insertApp } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

async function mk(userId: string, over: Partial<typeof schema.interviewQuestions.$inferInsert> = {}) {
  const [r] = await db
    .insert(schema.interviewQuestions)
    .values({ userId, text: "Q?", sortOrder: 1, ...over })
    .returning({ id: schema.interviewQuestions.id });
  return r.id;
}

describe("/api/questions/[id]", () => {
  it("401 for anon", async () => {
    expect((await PATCH(anonReq("/api/questions/1", "PATCH", { text: "x" }), ctx(1))).status).toBe(401);
    expect((await DELETE(anonReq("/api/questions/1", "DELETE"), ctx(1))).status).toBe(401);
  });

  it("patches text and sortOrder", async () => {
    const id = await mk(globalThis.__testUserId);
    const res = await PATCH(req(`/api/questions/${id}`, "PATCH", { text: " New ", sortOrder: 7 }), ctx(id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id, text: "New", sortOrder: 7 });
  });

  it("patches a job-specific question", async () => {
    const appId = await insertApp();
    const id = await mk(globalThis.__testUserId, { applicationId: appId });
    const res = await PATCH(req(`/api/questions/${id}`, "PATCH", { text: "Job Q" }), ctx(id));
    expect(res.status).toBe(200);
  });

  it("400 on bad text or non-integer sortOrder", async () => {
    const id = await mk(globalThis.__testUserId);
    expect((await PATCH(req(`/api/questions/${id}`, "PATCH", { text: " " }), ctx(id))).status).toBe(400);
    expect((await PATCH(req(`/api/questions/${id}`, "PATCH", { sortOrder: 1.5 }), ctx(id))).status).toBe(400);
    expect((await PATCH(req(`/api/questions/${id}`, "PATCH", { sortOrder: "2" }), ctx(id))).status).toBe(400);
  });

  it("404 cross-tenant and missing", async () => {
    const other = await seedUser("qid-other");
    const id = await mk(other.id);
    expect((await PATCH(req(`/api/questions/${id}`, "PATCH", { text: "hack" }), ctx(id))).status).toBe(404);
    expect((await DELETE(req(`/api/questions/${id}`, "DELETE"), ctx(id))).status).toBe(404);
    expect((await PATCH(req(`/api/questions/999999`, "PATCH", { text: "x" }), ctx(999999))).status).toBe(404);
    const [row] = await db.select().from(schema.interviewQuestions).where(eq(schema.interviewQuestions.id, id));
    expect(row.text).toBe("Q?");
  });

  it("deletes an owned question", async () => {
    const id = await mk(globalThis.__testUserId);
    const res = await DELETE(req(`/api/questions/${id}`, "DELETE"), ctx(id));
    expect(await res.json()).toEqual({ ok: true });
    const rows = await db.select().from(schema.interviewQuestions).where(eq(schema.interviewQuestions.id, id));
    expect(rows).toHaveLength(0);
  });
});
