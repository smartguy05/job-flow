import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm-provider", () => ({ complete: vi.fn() }));

import JSZip from "jszip";
import { complete } from "@/lib/llm-provider";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { req, anonReq, ctx, seedUser } from "@/test/req";
import { GET as LIST_PEOPLE, POST as ADD_PERSON } from "./people/route";
import { PATCH as PATCH_PERSON, DELETE as DEL_PERSON } from "./people/[subId]/route";
import { GET as LIST_11, POST as ADD_11 } from "./one-on-ones/route";
import { PATCH as PATCH_11, DELETE as DEL_11 } from "./one-on-ones/[subId]/route";
import { GET as LIST_REVIEWS, POST as ADD_REVIEW } from "./reviews/route";
import { PATCH as PATCH_REVIEW, DELETE as DEL_REVIEW } from "./reviews/[subId]/route";
import { GET as LIST_GOALS, POST as ADD_GOAL } from "./goals/route";
import { PATCH as PATCH_GOAL, DELETE as DEL_GOAL } from "./goals/[subId]/route";
import { GET as BRAG } from "./brag-doc/route";
import { POST as SELF_REVIEW } from "./self-review/route";
import { GET as JOB_DETAIL, PATCH as PATCH_JOB } from "./route";

const mockComplete = vi.mocked(complete);
beforeEach(() => {
  mockComplete.mockReset();
});

const subCtx = (id: number, subId: number | string) => ({ params: Promise.resolve({ id: String(id), subId: String(subId) }) });

async function makeJob(userId = globalThis.__testUserId, company = "Routes Co") {
  const [j] = await db
    .insert(schema.jobs)
    .values({ userId, company, companyNormalized: company.toLowerCase(), title: "Engineer", startDate: "2022-01-01", manager: "Legacy Mgr" })
    .returning({ id: schema.jobs.id });
  return j.id;
}

const RESOURCES = [
  { name: "people", list: LIST_PEOPLE, add: ADD_PERSON, patch: PATCH_PERSON, del: DEL_PERSON, body: { name: "Pat", relationship: "manager" }, edit: { title: "VP" }, bad: { relationship: "boss" } },
  { name: "one-on-ones", list: LIST_11, add: ADD_11, patch: PATCH_11, del: DEL_11, body: { date: "2026-05-01", notes: "n" }, edit: { notes: "m" }, bad: { date: "May" } },
  { name: "reviews", list: LIST_REVIEWS, add: ADD_REVIEW, patch: PATCH_REVIEW, del: DEL_REVIEW, body: { cycle: "2026 H1" }, edit: { rating: "Exceeds" }, bad: { cycle: "" } },
  { name: "goals", list: LIST_GOALS, add: ADD_GOAL, patch: PATCH_GOAL, del: DEL_GOAL, body: { title: "Ship" }, edit: { progress: 40 }, bad: { progress: 101 } },
] as const;

describe.each(RESOURCES)("/api/jobs/[id]/$name", (r) => {
  const url = (id: number) => `/api/jobs/${id}/${r.name}`;

  it("requires auth", async () => {
    expect((await r.list(anonReq(url(1)), ctx(1))).status).toBe(401);
    expect((await r.add(anonReq(url(1), "POST", r.body), ctx(1))).status).toBe(401);
    expect((await r.patch(anonReq(url(1), "PATCH", r.edit), subCtx(1, 1))).status).toBe(401);
    expect((await r.del(anonReq(url(1), "DELETE"), subCtx(1, 1))).status).toBe(401);
  });

  it("creates, lists, edits and deletes", async () => {
    const jobId = await makeJob();
    const created = await r.add(req(url(jobId), "POST", r.body), ctx(jobId));
    expect(created.status).toBe(200);
    const { id } = await created.json();
    expect((await r.add(req(url(jobId), "POST", { ...r.body, ...r.bad }), ctx(jobId))).status).toBe(400);
    expect((await r.patch(req(`${url(jobId)}/${id}`, "PATCH", r.edit), subCtx(jobId, id))).status).toBe(200);
    expect((await r.patch(req(`${url(jobId)}/${id}`, "PATCH", r.bad), subCtx(jobId, id))).status).toBe(400);
    const list = await (await r.list(req(url(jobId)), ctx(jobId))).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject(r.edit);
    expect((await r.del(req(`${url(jobId)}/${id}`, "DELETE"), subCtx(jobId, id))).status).toBe(200);
    expect((await r.del(req(`${url(jobId)}/${id}`, "DELETE"), subCtx(jobId, id))).status).toBe(404);
    expect(await (await r.list(req(url(jobId)), ctx(jobId))).json()).toEqual([]);
  });

  it("isolates tenants", async () => {
    const jobId = await makeJob();
    const { id } = await (await r.add(req(url(jobId), "POST", r.body), ctx(jobId))).json();
    const other = await seedUser(`growth-routes-${r.name}`);
    expect((await r.list(other.req(url(jobId)), ctx(jobId))).status).toBe(404);
    expect((await r.add(other.req(url(jobId), "POST", r.body), ctx(jobId))).status).toBe(404);
    expect((await r.patch(other.req(`${url(jobId)}/${id}`, "PATCH", r.edit), subCtx(jobId, id))).status).toBe(404);
    expect((await r.del(other.req(`${url(jobId)}/${id}`, "DELETE"), subCtx(jobId, id))).status).toBe(404);
    expect(await (await r.list(req(url(jobId)), ctx(jobId))).json()).toHaveLength(1);
  });
});

describe("job detail: next review date and derived manager", () => {
  it("stores nextReviewDate and derives the current manager from people", async () => {
    const jobId = await makeJob();
    expect((await PATCH_JOB(req(`/api/jobs/${jobId}`, "PATCH", { nextReviewDate: "soon" }), ctx(jobId))).status).toBe(400);
    expect((await PATCH_JOB(req(`/api/jobs/${jobId}`, "PATCH", { nextReviewDate: "2026-12-01" }), ctx(jobId))).status).toBe(200);
    let d = await (await JOB_DETAIL(req(`/api/jobs/${jobId}`), ctx(jobId))).json();
    expect(d.job.nextReviewDate).toBe("2026-12-01");
    expect(d.currentManager).toBe("Legacy Mgr");
    await ADD_PERSON(req(`/api/jobs/${jobId}/people`, "POST", { name: "Old", relationship: "manager", startDate: "2022-01-01", endDate: "2023-01-01" }), ctx(jobId));
    await ADD_PERSON(req(`/api/jobs/${jobId}/people`, "POST", { name: "New", relationship: "manager", startDate: "2023-01-02" }), ctx(jobId));
    d = await (await JOB_DETAIL(req(`/api/jobs/${jobId}`), ctx(jobId))).json();
    expect(d.currentManager).toBe("New");
    expect(d.managerHistory.map((m: { name: string }) => m.name)).toEqual(["Old", "New"]);
  });
});

describe("PATCH /api/jobs/[id] review date and profile sync", () => {
  it("a review-date-only edit keeps the job's profile sync state; other edits clear it", async () => {
    const jobId = await makeJob();
    const synced = new Date("2026-01-01T00:00:00Z");
    await db.update(schema.jobs).set({ profileSyncedAt: synced }).where(eq(schema.jobs.id, jobId));
    await PATCH_JOB(req(`/api/jobs/${jobId}`, "PATCH", { nextReviewDate: "2026-12-01" }), ctx(jobId));
    let [j] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    expect(j.profileSyncedAt?.toISOString()).toBe(synced.toISOString());
    await PATCH_JOB(req(`/api/jobs/${jobId}`, "PATCH", { team: "Core" }), ctx(jobId));
    [j] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    expect(j.profileSyncedAt).toBeNull();
  });
});

describe("GET /api/jobs/[id]/brag-doc", () => {
  async function seeded() {
    const jobId = await makeJob();
    await db.insert(schema.journalEntries).values([
      { userId: globalThis.__testUserId, jobId, kind: "achievement", title: "Cut costs", impact: "-30%", entryDate: "2026-02-01" },
      { userId: globalThis.__testUserId, jobId, kind: "complaint", title: "SECRET-GRIPE", entryDate: "2026-02-02" },
    ]);
    return jobId;
  }

  it("requires auth and an owned job", async () => {
    const jobId = await seeded();
    expect((await BRAG(anonReq(`/api/jobs/${jobId}/brag-doc`), ctx(jobId))).status).toBe(401);
    const other = await seedUser("brag-other");
    expect((await BRAG(other.req(`/api/jobs/${jobId}/brag-doc`), ctx(jobId))).status).toBe(404);
  });

  it("returns markdown by default, JSON or DOCX on request, and rejects bad params", async () => {
    const jobId = await seeded();
    const md = await BRAG(req(`/api/jobs/${jobId}/brag-doc?from=2026-01-01&to=2026-12-31`), ctx(jobId));
    expect(md.headers.get("content-type")).toContain("text/markdown");
    const text = await md.text();
    expect(text).toContain("Cut costs");
    expect(text).not.toContain("SECRET-GRIPE");

    const json = await (await BRAG(req(`/api/jobs/${jobId}/brag-doc?fmt=json`), ctx(jobId))).json();
    expect(json.doc.achievements[0].title).toBe("Cut costs");
    expect(json.markdown).toContain("Cut costs");

    const docx = await BRAG(req(`/api/jobs/${jobId}/brag-doc?fmt=docx`), ctx(jobId));
    expect(docx.headers.get("content-disposition")).toContain(".docx");
    const xml = await (await JSZip.loadAsync(Buffer.from(await docx.arrayBuffer()))).file("word/document.xml")!.async("string");
    expect(xml).toContain("Cut costs");

    expect((await BRAG(req(`/api/jobs/${jobId}/brag-doc?fmt=pdf`), ctx(jobId))).status).toBe(400);
    expect((await BRAG(req(`/api/jobs/${jobId}/brag-doc?from=yesterday`), ctx(jobId))).status).toBe(400);
  });
});

describe("POST /api/jobs/[id]/self-review", () => {
  it("drafts from the brag doc without leaking private data", async () => {
    const jobId = await makeJob();
    await db.insert(schema.journalEntries).values([
      { userId: globalThis.__testUserId, jobId, kind: "achievement", title: "Led migration", entryDate: "2026-02-01" },
      { userId: globalThis.__testUserId, jobId, kind: "note", title: "SECRET-NOTE", entryDate: "2026-02-02" },
    ]);
    await ADD_11(req(`/api/jobs/${jobId}/one-on-ones`, "POST", { notes: "SECRET-1ON1" }), ctx(jobId));
    mockComplete.mockResolvedValue("Draft text");
    expect((await SELF_REVIEW(anonReq(`/api/jobs/${jobId}/self-review`, "POST", {}), ctx(jobId))).status).toBe(401);
    const res = await SELF_REVIEW(req(`/api/jobs/${jobId}/self-review`, "POST", { cycle: "2026 H1" }), ctx(jobId));
    expect(res.status).toBe(200);
    expect((await res.json()).draft).toBe("Draft text");
    const sent = JSON.stringify(mockComplete.mock.calls[0][0]);
    expect(sent).toContain("Led migration");
    expect(sent).not.toContain("SECRET-NOTE");
    expect(sent).not.toContain("SECRET-1ON1");
  });

  it("returns 400 when there is nothing to draft from, and 404 for another user's job", async () => {
    const jobId = await makeJob();
    expect((await SELF_REVIEW(req(`/api/jobs/${jobId}/self-review`, "POST", {}), ctx(jobId))).status).toBe(400);
    const other = await seedUser("self-review-other");
    expect((await SELF_REVIEW(other.req(`/api/jobs/${jobId}/self-review`, "POST", {}), ctx(jobId))).status).toBe(404);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("returns 500 when the model fails", async () => {
    const jobId = await makeJob();
    await db.insert(schema.journalEntries).values({ userId: globalThis.__testUserId, jobId, kind: "achievement", title: "Win" });
    mockComplete.mockRejectedValue(new Error("model down"));
    const res = await SELF_REVIEW(req(`/api/jobs/${jobId}/self-review`, "POST", {}), ctx(jobId));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("model down");
  });
});
