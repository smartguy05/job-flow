import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { req, anonReq, ctx, seedUser } from "@/test/req";
import { GET as LIST_EQUITY, POST as ADD_EQUITY } from "./equity/route";
import { PATCH as PATCH_EQUITY, DELETE as DEL_EQUITY } from "./equity/[subId]/route";
import { GET as EQUITY_SUMMARY } from "./equity/summary/route";
import { GET as LIST_PTO, POST as ADD_PTO } from "./pto/route";
import { PATCH as PATCH_PTO, DELETE as DEL_PTO } from "./pto/[subId]/route";
import { GET as PTO_SUMMARY } from "./pto/summary/route";
import { GET as LIST_FILES, POST as UPLOAD } from "./files/route";
import { GET as DOWNLOAD, DELETE as DEL_FILE } from "./files/[fileId]/route";

const subCtx = (id: number, subId: number | string) => ({ params: Promise.resolve({ id: String(id), subId: String(subId) }) });
const fileCtx = (id: number, fileId: number | string) => ({ params: Promise.resolve({ id: String(id), fileId: String(fileId) }) });

async function makeJob(userId = globalThis.__testUserId) {
  const [j] = await db
    .insert(schema.jobs)
    .values({ userId, company: "Post Hire Co", companyNormalized: "post hire co", title: "Engineer" })
    .returning({ id: schema.jobs.id });
  return j.id;
}

const RESOURCES = [
  { name: "equity", list: LIST_EQUITY, add: ADD_EQUITY, patch: PATCH_EQUITY, del: DEL_EQUITY, body: { shares: 1000, grantDate: "2024-01-01" }, edit: { frequency: "quarterly" }, bad: { cliffMonths: 99 } },
  { name: "pto", list: LIST_PTO, add: ADD_PTO, patch: PATCH_PTO, del: DEL_PTO, body: { startDate: "2026-10-12" }, edit: { kind: "sick" }, bad: { kind: "nap" } },
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
  });

  it("isolates tenants", async () => {
    const jobId = await makeJob();
    const { id } = await (await r.add(req(url(jobId), "POST", r.body), ctx(jobId))).json();
    const other = await seedUser(`post-hire-routes-${r.name}`);
    expect((await r.list(other.req(url(jobId)), ctx(jobId))).status).toBe(404);
    expect((await r.add(other.req(url(jobId), "POST", r.body), ctx(jobId))).status).toBe(404);
    expect((await r.patch(other.req(`${url(jobId)}/${id}`, "PATCH", r.edit), subCtx(jobId, id))).status).toBe(404);
    expect((await r.del(other.req(`${url(jobId)}/${id}`, "DELETE"), subCtx(jobId, id))).status).toBe(404);
    expect(await (await r.list(req(url(jobId)), ctx(jobId))).json()).toHaveLength(1);
  });
});

describe("GET /api/jobs/[id]/equity/summary", () => {
  it("summarizes the job's grants as of a date", async () => {
    const jobId = await makeJob();
    await ADD_EQUITY(req(`/api/jobs/${jobId}/equity`, "POST", { vestStart: "2024-01-15", shares: 4800 }), ctx(jobId));
    const res = await EQUITY_SUMMARY(req(`/api/jobs/${jobId}/equity/summary?asOf=2025-01-15`), ctx(jobId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals).toMatchObject({ vested: 1200, unvested: 3600, nextVest: { date: "2025-02-15", shares: 100 } });
    expect((await EQUITY_SUMMARY(req(`/api/jobs/${jobId}/equity/summary?asOf=soon`), ctx(jobId))).status).toBe(400);
    expect((await EQUITY_SUMMARY(anonReq(`/api/jobs/${jobId}/equity/summary`), ctx(jobId))).status).toBe(401);
    const other = await seedUser("equity-summary-route-other");
    expect((await EQUITY_SUMMARY(other.req(`/api/jobs/${jobId}/equity/summary`), ctx(jobId))).status).toBe(404);
  });
});

describe("GET /api/jobs/[id]/pto/summary", () => {
  it("returns the year's balance", async () => {
    const jobId = await makeJob();
    await db.insert(schema.jobBenefits).values({ userId: globalThis.__testUserId, jobId, ptoDays: 15 });
    await ADD_PTO(req(`/api/jobs/${jobId}/pto`, "POST", { startDate: "2026-10-12", endDate: "2026-10-16" }), ctx(jobId));
    const res = await PTO_SUMMARY(req(`/api/jobs/${jobId}/pto/summary?year=2026`), ctx(jobId));
    expect(await res.json()).toMatchObject({ year: 2026, allowance: 15, used: 5, remaining: 10 });
    expect((await PTO_SUMMARY(req(`/api/jobs/${jobId}/pto/summary`), ctx(jobId))).status).toBe(200);
    expect((await PTO_SUMMARY(req(`/api/jobs/${jobId}/pto/summary?year=abc`), ctx(jobId))).status).toBe(400);
    expect((await PTO_SUMMARY(anonReq(`/api/jobs/${jobId}/pto/summary`), ctx(jobId))).status).toBe(401);
    const other = await seedUser("pto-summary-route-other");
    expect((await PTO_SUMMARY(other.req(`/api/jobs/${jobId}/pto/summary`), ctx(jobId))).status).toBe(404);
  });
});

function uploadReq(url: string, file: File | null, opts: { cookie?: string; kind?: string } = {}) {
  const form = new FormData();
  if (file) form.set("file", file);
  if (opts.kind !== undefined) form.set("kind", opts.kind);
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { cookie: opts.cookie ?? globalThis.__testCookie ?? "" },
    body: form,
  });
}
const pdf = (name = "offer.pdf") => new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });

describe("/api/jobs/[id]/files", () => {
  it("uploads, lists, downloads and deletes", async () => {
    const jobId = await makeJob();
    const url = `/api/jobs/${jobId}/files`;
    const res = await UPLOAD(uploadReq(url, pdf(), { kind: "offer_letter" }), ctx(jobId));
    expect(res.status).toBe(200);
    const meta = await res.json();
    expect(meta).toMatchObject({ kind: "offer_letter", name: "offer.pdf", size: 3, mimeType: "application/pdf" });
    const list = await (await LIST_FILES(req(url), ctx(jobId))).json();
    expect(list).toHaveLength(1);
    expect(list[0].data).toBeUndefined();

    const dl = await DOWNLOAD(req(`${url}/${meta.id}`), fileCtx(jobId, meta.id));
    expect(dl.headers.get("content-type")).toBe("application/pdf");
    expect(dl.headers.get("content-disposition")).toMatch(/^attachment; filename="offer.pdf"/);
    expect(new Uint8Array(await dl.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const inline = await DOWNLOAD(req(`${url}/${meta.id}?inline=1`), fileCtx(jobId, meta.id));
    expect(inline.headers.get("content-disposition")).toMatch(/^inline;/);

    expect((await DEL_FILE(req(`${url}/${meta.id}`, "DELETE"), fileCtx(jobId, meta.id))).status).toBe(200);
    expect((await DOWNLOAD(req(`${url}/${meta.id}`), fileCtx(jobId, meta.id))).status).toBe(404);
    expect((await DEL_FILE(req(`${url}/${meta.id}`, "DELETE"), fileCtx(jobId, meta.id))).status).toBe(404);
  });

  it("rejects bad uploads", async () => {
    const jobId = await makeJob();
    const url = `/api/jobs/${jobId}/files`;
    expect((await UPLOAD(uploadReq(url, null), ctx(jobId))).status).toBe(400);
    const txt = new File([new Uint8Array([1])], "a.txt", { type: "text/plain" });
    expect((await UPLOAD(uploadReq(url, txt), ctx(jobId))).status).toBe(400);
    expect((await UPLOAD(uploadReq(url, pdf(), { kind: "payslip" }), ctx(jobId))).status).toBe(400);
    const notForm = new NextRequest(`http://localhost${url}`, { method: "POST", headers: { cookie: globalThis.__testCookie ?? "", "content-type": "application/json" }, body: "{}" });
    expect((await UPLOAD(notForm, ctx(jobId))).status).toBe(400);
    expect(await (await LIST_FILES(req(url), ctx(jobId))).json()).toEqual([]);
  });

  it("requires auth and isolates tenants", async () => {
    const jobId = await makeJob();
    const url = `/api/jobs/${jobId}/files`;
    const { id } = await (await UPLOAD(uploadReq(url, pdf()), ctx(jobId))).json();
    expect((await LIST_FILES(anonReq(url), ctx(jobId))).status).toBe(401);
    expect((await UPLOAD(uploadReq(url, pdf(), { cookie: "" }), ctx(jobId))).status).toBe(401);
    expect((await DOWNLOAD(anonReq(`${url}/${id}`), fileCtx(jobId, id))).status).toBe(401);
    expect((await DEL_FILE(anonReq(`${url}/${id}`, "DELETE"), fileCtx(jobId, id))).status).toBe(401);
    const other = await seedUser("job-files-route-other");
    expect((await LIST_FILES(other.req(url), ctx(jobId))).status).toBe(404);
    expect((await UPLOAD(uploadReq(url, pdf(), { cookie: other.cookie }), ctx(jobId))).status).toBe(404);
    expect((await DOWNLOAD(other.req(`${url}/${id}`), fileCtx(jobId, id))).status).toBe(404);
    expect((await DEL_FILE(other.req(`${url}/${id}`, "DELETE"), fileCtx(jobId, id))).status).toBe(404);
    expect(await (await LIST_FILES(req(url), ctx(jobId))).json()).toHaveLength(1);
  });
});
