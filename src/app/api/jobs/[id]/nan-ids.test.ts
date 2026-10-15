import { describe, it, expect } from "vitest";
import { db, schema } from "@/db";
import { req } from "@/test/req";
import { PATCH as PATCH_EQUITY, DELETE as DEL_EQUITY } from "./equity/[subId]/route";
import { PATCH as PATCH_GOAL } from "./goals/[subId]/route";
import { GET as DOWNLOAD, DELETE as DEL_FILE } from "./files/[fileId]/route";

const subCtx = (id: number | string, subId: string) => ({ params: Promise.resolve({ id: String(id), subId }) });
const fileCtx = (id: number | string, fileId: string) => ({ params: Promise.resolve({ id: String(id), fileId }) });

async function makeJob() {
  const [j] = await db
    .insert(schema.jobs)
    .values({ userId: globalThis.__testUserId, company: "Nan Co", companyNormalized: "nan co", title: "Engineer" })
    .returning({ id: schema.jobs.id });
  return j.id;
}

// A non-numeric item id in the path is a 404, not an unhandled database error (500).
describe("non-numeric sub-resource ids", () => {
  it("returns 404 for growth items", async () => {
    const jobId = await makeJob();
    expect((await PATCH_EQUITY(req(`/api/jobs/${jobId}/equity/abc`, "PATCH", { frequency: "annual" }), subCtx(jobId, "abc"))).status).toBe(404);
    expect((await DEL_EQUITY(req(`/api/jobs/${jobId}/equity/abc`, "DELETE"), subCtx(jobId, "abc"))).status).toBe(404);
    expect((await PATCH_GOAL(req(`/api/jobs/${jobId}/goals/abc`, "PATCH", { progress: 5 }), subCtx(jobId, "abc"))).status).toBe(404);
  });

  it("returns 404 for job files", async () => {
    const jobId = await makeJob();
    expect((await DOWNLOAD(req(`/api/jobs/${jobId}/files/abc`), fileCtx(jobId, "abc"))).status).toBe(404);
    expect((await DEL_FILE(req(`/api/jobs/${jobId}/files/abc`, "DELETE"), fileCtx(jobId, "abc"))).status).toBe(404);
  });
});
