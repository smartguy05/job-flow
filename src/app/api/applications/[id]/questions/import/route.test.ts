import { describe, it, expect } from "vitest";
import { POST } from "./route";
import { GET } from "../route";
import { POST as GENERAL } from "../../../../questions/route";
import { req, anonReq, ctx, insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";

async function iv(appId: number, questions?: string[], userId = globalThis.__testUserId) {
  const [r] = await db
    .insert(schema.interviews)
    .values({
      userId,
      applicationId: appId,
      round: "R",
      prepPackJson: questions ? JSON.stringify({ questionsToAsk: questions }) : null,
    })
    .returning({ id: schema.interviews.id });
  return r.id;
}
const imp = (appId: number, body: unknown) => POST(req(`/x`, "POST", body), ctx(appId));

describe("POST /api/applications/[id]/questions/import", () => {
  it("401 for anon", async () => {
    const appId = await insertApp();
    expect((await POST(anonReq(`/x`, "POST", { interviewId: 1 }), ctx(appId))).status).toBe(401);
  });

  it("imports with dedupe against job and general questions, and is idempotent", async () => {
    const appId = await insertApp();
    await GENERAL(req("/api/questions", "POST", { text: "What is the culture like?" }));
    const id = await iv(appId, ["what is the culture like?", "How big is the team?", "How big is the team?", "  ", "What are the goals?"]);
    const res = await imp(appId, { interviewId: id });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ added: 2 });
    expect(await (await imp(appId, { interviewId: id })).json()).toEqual({ added: 0 });
    const data = await (await GET(req(`/x`), ctx(appId))).json();
    const jobs = data.items.filter((i: { source: string }) => i.source === "job").map((i: { text: string }) => i.text);
    expect(jobs).toEqual(["How big is the team?", "What are the goals?"]);
  });

  it("400 with no prep pack or bad interviewId", async () => {
    const appId = await insertApp();
    const id = await iv(appId);
    expect((await imp(appId, { interviewId: id })).status).toBe(400);
    expect((await imp(appId, {})).status).toBe(400);
  });

  it("404 for interview on another application or another user", async () => {
    const appId = await insertApp();
    const otherApp = await insertApp();
    const elsewhere = await iv(otherApp, ["Q?"]);
    expect((await imp(appId, { interviewId: elsewhere })).status).toBe(404);
    const other = await seedUser("import-other");
    const [oa] = await db
      .insert(schema.applications)
      .values({ userId: other.id, company: "X", companyNormalized: "x", roleTitle: "R", status: "applied", jdSnapshot: "", lastActivityAt: new Date() })
      .returning({ id: schema.applications.id });
    const theirs = await iv(oa.id, ["Q?"], other.id);
    expect((await imp(appId, { interviewId: theirs })).status).toBe(404);
    expect((await imp(oa.id, { interviewId: theirs })).status).toBe(404);
    expect((await imp(appId, { interviewId: 999999 })).status).toBe(404);
  });
});
