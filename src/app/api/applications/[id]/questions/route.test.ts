import { describe, it, expect } from "vitest";
import { GET, POST, DELETE } from "./route";
import { PUT } from "./[questionId]/route";
import { POST as GENERAL } from "../../../questions/route";
import { req, anonReq, ctx, insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";

const qctx = (id: number, questionId: number) => ({
  params: Promise.resolve({ id: String(id), questionId: String(questionId) }),
});
const addGeneral = async (text: string) => (await (await GENERAL(req("/api/questions", "POST", { text }))).json()).id as number;
const list = async (appId: number) => (await (await GET(req(`/api/applications/${appId}/questions`), ctx(appId))).json());
const check = (appId: number, qid: number, body: unknown) =>
  PUT(req(`/api/applications/${appId}/questions/${qid}`, "PUT", body), qctx(appId, qid));

describe("/api/applications/[id]/questions", () => {
  it("401 for anon", async () => {
    const appId = await insertApp();
    expect((await GET(anonReq(`/x`), ctx(appId))).status).toBe(401);
    expect((await POST(anonReq(`/x`, "POST", { text: "a" }), ctx(appId))).status).toBe(401);
    expect((await DELETE(anonReq(`/x`, "DELETE"), ctx(appId))).status).toBe(401);
  });

  it("404 cross-tenant on every method", async () => {
    const other = await seedUser("appq-other");
    const [a] = await db
      .insert(schema.applications)
      .values({ userId: other.id, company: "X", companyNormalized: "x", roleTitle: "R", status: "applied", jdSnapshot: "", lastActivityAt: new Date() })
      .returning({ id: schema.applications.id });
    expect((await GET(req(`/x`), ctx(a.id))).status).toBe(404);
    expect((await POST(req(`/x`, "POST", { text: "q" }), ctx(a.id))).status).toBe(404);
    expect((await DELETE(req(`/x`, "DELETE"), ctx(a.id))).status).toBe(404);
  });

  it("GET returns application, items and prep packs", async () => {
    const appId = await insertApp({ company: "Initech", roleTitle: "Dev" });
    const gid = await addGeneral("General one?");
    const now = new Date();
    const pack = JSON.stringify({ questionsToAsk: ["What is the team size?"] });
    const [iv] = await db
      .insert(schema.interviews)
      .values({ userId: globalThis.__testUserId, applicationId: appId, round: "Tech", prepPackJson: pack, prepGeneratedAt: now })
      .returning({ id: schema.interviews.id });
    await db.insert(schema.interviews).values({ userId: globalThis.__testUserId, applicationId: appId, round: "Empty", prepPackJson: JSON.stringify({ questionsToAsk: [] }) });
    await db.insert(schema.interviews).values({ userId: globalThis.__testUserId, applicationId: appId, round: "Bad", prepPackJson: "not json" });
    const data = await list(appId);
    expect(data.application).toEqual({ id: appId, company: "Initech", roleTitle: "Dev" });
    expect(data.items.find((i: { id: number }) => i.id === gid).source).toBe("general");
    expect(data.prepPacks).toHaveLength(1);
    expect(data.prepPacks[0]).toMatchObject({ interviewId: iv.id, round: "Tech", count: 1 });
  });

  it("POST adds job-specific questions with increasing sortOrder; 400 on blank", async () => {
    const appId = await insertApp();
    const a = await (await POST(req(`/x`, "POST", { text: "Mine 1" }), ctx(appId))).json();
    const res = await POST(req(`/x`, "POST", { text: "Mine 2" }), ctx(appId));
    expect(res.status).toBe(201);
    expect((await res.json()).sortOrder).toBe(a.sortOrder + 1);
    expect((await POST(req(`/x`, "POST", { text: " " }), ctx(appId))).status).toBe(400);
    const data = await list(appId);
    const mine = data.items.filter((i: { source: string }) => i.source === "job");
    expect(mine.map((i: { text: string }) => i.text)).toEqual(["Mine 1", "Mine 2"]);
  });

  it("checked items move to the bottom", async () => {
    const appId = await insertApp();
    const first = await addGeneral("Order A?");
    await addGeneral("Order B?");
    const res = await check(appId, first, { checked: true });
    expect(res.status).toBe(200);
    const items = (await list(appId)).items;
    const idx = items.findIndex((i: { id: number }) => i.id === first);
    expect(items[idx].checked).toBe(true);
    expect(items.slice(idx).every((i: { checked: boolean }) => i.checked)).toBe(true);
    expect(items[items.length - 1].id).toBe(first);
  });

  it("checking a general question in job A does not check it in job B", async () => {
    const appA = await insertApp();
    const appB = await insertApp();
    const gid = await addGeneral("Isolation?");
    await check(appA, gid, { checked: true });
    const a = (await list(appA)).items.find((i: { id: number }) => i.id === gid);
    const b = (await list(appB)).items.find((i: { id: number }) => i.id === gid);
    expect(a.checked).toBe(true);
    expect(b.checked).toBe(false);
  });

  it("reset unchecks everything for the job but keeps notes", async () => {
    const appId = await insertApp();
    const otherApp = await insertApp();
    const gid = await addGeneral("Reset?");
    await check(appId, gid, { checked: true, notes: "keep me" });
    await check(otherApp, gid, { checked: true });
    const res = await DELETE(req(`/x`, "DELETE"), ctx(appId));
    expect(await res.json()).toEqual({ ok: true });
    const item = (await list(appId)).items.find((i: { id: number }) => i.id === gid);
    expect(item.checked).toBe(false);
    expect(item.notes).toBe("keep me");
    const other = (await list(otherApp)).items.find((i: { id: number }) => i.id === gid);
    expect(other.checked).toBe(true);
  });
});
