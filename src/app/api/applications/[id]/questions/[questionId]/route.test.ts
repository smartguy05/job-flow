import { describe, it, expect } from "vitest";
import { PUT } from "./route";
import { req, anonReq, insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";

const qctx = (id: number, questionId: number) => ({
  params: Promise.resolve({ id: String(id), questionId: String(questionId) }),
});
const put = (appId: number, qid: number, body: unknown) =>
  PUT(req(`/x`, "PUT", body), qctx(appId, qid));
async function mk(userId: string, applicationId: number | null = null) {
  const [r] = await db
    .insert(schema.interviewQuestions)
    .values({ userId, applicationId, text: "Q?", sortOrder: 0 })
    .returning({ id: schema.interviewQuestions.id });
  return r.id;
}

describe("PUT /api/applications/[id]/questions/[questionId]", () => {
  it("401 for anon", async () => {
    expect((await PUT(anonReq(`/x`, "PUT", { checked: true }), qctx(1, 1))).status).toBe(401);
  });

  it("checks, keeps checkedAt when re-checked, unchecks, saves notes (idempotent upsert)", async () => {
    const appId = await insertApp();
    const qid = await mk(globalThis.__testUserId);
    const first = (await (await put(appId, qid, { checked: true })).json()).item;
    expect(first).toMatchObject({ id: qid, source: "general", checked: true, notes: "" });
    await new Promise((r) => setTimeout(r, 15));
    const again = (await (await put(appId, qid, { checked: true, notes: "n1" })).json()).item;
    expect(again.checkedAt).toBe(first.checkedAt);
    expect(again.notes).toBe("n1");
    const notesOnly = (await (await put(appId, qid, { notes: "n2" })).json()).item;
    expect(notesOnly.checked).toBe(true);
    expect(notesOnly.notes).toBe("n2");
    const off = (await (await put(appId, qid, { checked: false })).json()).item;
    expect(off.checked).toBe(false);
    expect(off.checkedAt).toBeNull();
    expect(off.notes).toBe("n2");
    const rows = await db
      .select()
      .from(schema.applicationQuestionState)
      .where(and(eq(schema.applicationQuestionState.applicationId, appId), eq(schema.applicationQuestionState.questionId, qid)));
    expect(rows).toHaveLength(1);
  });

  it("job-specific question reports source job", async () => {
    const appId = await insertApp();
    const qid = await mk(globalThis.__testUserId, appId);
    const item = (await (await put(appId, qid, { checked: true })).json()).item;
    expect(item.source).toBe("job");
  });

  it("400 on invalid body", async () => {
    const appId = await insertApp();
    const qid = await mk(globalThis.__testUserId);
    expect((await put(appId, qid, { notes: 5 })).status).toBe(400);
    expect((await put(appId, qid, { checked: "yes" })).status).toBe(400);
  });

  it("404 for another user's application or question, or another application's job question", async () => {
    const other = await seedUser("qstate-other");
    const [oa] = await db
      .insert(schema.applications)
      .values({ userId: other.id, company: "X", companyNormalized: "x", roleTitle: "R", status: "applied", jdSnapshot: "", lastActivityAt: new Date() })
      .returning({ id: schema.applications.id });
    const appId = await insertApp();
    const otherApp = await insertApp();
    const mine = await mk(globalThis.__testUserId);
    const theirs = await mk(other.id);
    const jobOnOther = await mk(globalThis.__testUserId, otherApp);
    expect((await put(oa.id, mine, { checked: true })).status).toBe(404);
    expect((await put(appId, theirs, { checked: true })).status).toBe(404);
    expect((await put(appId, jobOnOther, { checked: true })).status).toBe(404);
    expect((await put(appId, 999999, { checked: true })).status).toBe(404);
  });
});
