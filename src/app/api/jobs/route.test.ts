import { describe, it, expect } from "vitest";
import { GET, POST } from "./route";
import { GET as GET_ONE, PATCH, DELETE } from "./[id]/route";
import { GET as LIST_COMP, POST as ADD_COMP } from "./[id]/compensation/route";
import { PATCH as PATCH_COMP, DELETE as DEL_COMP } from "./[id]/compensation/[compId]/route";
import { PUT as PUT_BEN } from "./[id]/benefits/route";
import { GET as LIST_J, POST as ADD_J } from "./[id]/journal/route";
import { PATCH as PATCH_J, DELETE as DEL_J } from "../journal/[id]/route";
import { POST as MARK_SYNCED } from "../journal/mark-synced/route";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { req, anonReq, ctx, seedUser } from "@/test/req";

const compCtx = (id: number, compId: number) => ({ params: Promise.resolve({ id: String(id), compId: String(compId) }) });

async function createJob(body: Record<string, unknown> = {}): Promise<number> {
  const res = await POST(req("/api/jobs", "POST", { company: "Initech LLC", title: "Engineer", startDate: "2024-01-01", ...body }));
  expect(res.status).toBe(200);
  return (await res.json()).id;
}

describe("jobs CRUD", () => {
  it("requires auth", async () => {
    expect((await GET(anonReq("/api/jobs"))).status).toBe(401);
    expect((await POST(anonReq("/api/jobs", "POST", {}))).status).toBe(401);
    expect((await GET_ONE(anonReq("/api/jobs/1"), ctx(1))).status).toBe(401);
  });

  it("validates input", async () => {
    expect((await POST(req("/api/jobs", "POST", { company: "A" }))).status).toBe(400);
    expect((await POST(req("/api/jobs", "POST", { company: "A", title: "B", startDate: "soon" }))).status).toBe(400);
  });

  it("creates, lists (current first), reads, patches and deletes", async () => {
    const old = await createJob({ company: "Old Co", startDate: "2019-01-01", endDate: "2023-12-31" });
    const cur = await createJob({ technologies: ["Go"] });

    const list = await (await GET(req("/api/jobs"))).json();
    const ids = list.map((j: { id: number }) => j.id);
    expect(ids.indexOf(cur)).toBeLessThan(ids.indexOf(old));
    expect(list.find((j: { id: number }) => j.id === cur).technologies).toEqual(["Go"]);
    expect(list.find((j: { id: number }) => j.id === old).tenureMonths).toBe(59);

    const patched = await PATCH(req(`/api/jobs/${cur}`, "PATCH", { title: "Senior Engineer", team: "Core" }), ctx(cur));
    expect(patched.status).toBe(200);
    expect((await PATCH(req(`/api/jobs/${cur}`, "PATCH", { title: "" }), ctx(cur))).status).toBe(400);

    const detail = await (await GET_ONE(req(`/api/jobs/${cur}`), ctx(cur))).json();
    expect(detail.job).toMatchObject({ title: "Senior Engineer", team: "Core", companyNormalized: "initech" });
    expect(detail.benefits).toBeNull();
    expect(detail.compensation).toEqual([]);

    expect((await DELETE(req(`/api/jobs/${old}`, "DELETE"), ctx(old))).status).toBe(200);
    expect((await GET_ONE(req(`/api/jobs/${old}`), ctx(old))).status).toBe(404);
  });

  it("isolates jobs across users", async () => {
    const id = await createJob();
    const other = await seedUser("other-jobs");
    const list = await (await GET(other.req("/api/jobs"))).json();
    expect(list.find((j: { id: number }) => j.id === id)).toBeUndefined();
    expect((await GET_ONE(other.req(`/api/jobs/${id}`), ctx(id))).status).toBe(404);
    expect((await PATCH(other.req(`/api/jobs/${id}`, "PATCH", { title: "x" }), ctx(id))).status).toBe(404);
    expect((await DELETE(other.req(`/api/jobs/${id}`, "DELETE"), ctx(id))).status).toBe(404);
    expect((await ADD_COMP(other.req(`/api/jobs/${id}/compensation`, "POST", { baseAmount: 1 }), ctx(id))).status).toBe(404);
    expect((await PUT_BEN(other.req(`/api/jobs/${id}/benefits`, "PUT", { health: "x" }), ctx(id))).status).toBe(404);
    expect((await ADD_J(other.req(`/api/jobs/${id}/journal`, "POST", { title: "x" }), ctx(id))).status).toBe(404);
    expect((await LIST_J(other.req(`/api/jobs/${id}/journal`), ctx(id))).status).toBe(404);
  });
});

describe("compensation timeline", () => {
  it("adds, summarizes, edits and deletes comp rows", async () => {
    const id = await createJob();
    const a = await ADD_COMP(req(`/api/jobs/${id}/compensation`, "POST", { kind: "start", effectiveDate: "2024-01-01", baseAmount: 100000 }), ctx(id));
    expect(a.status).toBe(200);
    const b = await (await ADD_COMP(req(`/api/jobs/${id}/compensation`, "POST", { kind: "raise", effectiveDate: "2025-01-01", baseAmount: 105000 }), ctx(id))).json();
    expect((await ADD_COMP(req(`/api/jobs/${id}/compensation`, "POST", { kind: "nope" }), ctx(id))).status).toBe(400);

    const listed = await (await LIST_COMP(req(`/api/jobs/${id}/compensation`), ctx(id))).json();
    expect(listed).toHaveLength(2);

    const detail = await (await GET_ONE(req(`/api/jobs/${id}`), ctx(id))).json();
    expect(detail.compSummary.totalGrowthPct).toBe(5);

    expect((await PATCH_COMP(req("/x", "PATCH", { baseAmount: 110000 }), compCtx(id, b.id))).status).toBe(200);
    const after = await (await GET_ONE(req(`/api/jobs/${id}`), ctx(id))).json();
    expect(after.compSummary.totalGrowthPct).toBe(10);
    expect((await PATCH_COMP(req("/x", "PATCH", { period: "week" }), compCtx(id, b.id))).status).toBe(400);

    expect((await DEL_COMP(req("/x", "DELETE"), compCtx(id, b.id))).status).toBe(200);
    expect((await DEL_COMP(req("/x", "DELETE"), compCtx(id, b.id))).status).toBe(404);
  });

  it("can't touch another user's comp row", async () => {
    const id = await createJob();
    const row = await (await ADD_COMP(req(`/api/jobs/${id}/compensation`, "POST", { baseAmount: 1 }), ctx(id))).json();
    const other = await seedUser("other-comp");
    expect((await PATCH_COMP(other.req("/x", "PATCH", { baseAmount: 2 }), compCtx(id, row.id))).status).toBe(404);
    expect((await DEL_COMP(other.req("/x", "DELETE"), compCtx(id, row.id))).status).toBe(404);
  });
});

describe("benefits", () => {
  it("upserts the benefits row", async () => {
    const id = await createJob();
    expect((await PUT_BEN(req(`/api/jobs/${id}/benefits`, "PUT", { health: "PPO", ptoDays: 20 }), ctx(id))).status).toBe(200);
    expect((await PUT_BEN(req(`/api/jobs/${id}/benefits`, "PUT", { ptoDays: 25, retirement: "4% match" }), ctx(id))).status).toBe(200);
    expect((await PUT_BEN(req(`/api/jobs/${id}/benefits`, "PUT", { ptoDays: "many" }), ctx(id))).status).toBe(400);
    const detail = await (await GET_ONE(req(`/api/jobs/${id}`), ctx(id))).json();
    expect(detail.benefits).toMatchObject({ health: "PPO", ptoDays: 25, retirement: "4% match" });
  });
});

describe("work journal", () => {
  it("adds, lists, edits (resetting sync), marks synced and deletes entries", async () => {
    const id = await createJob({ technologies: ["Go"] });
    expect((await ADD_J(req(`/api/jobs/${id}/journal`, "POST", { kind: "achievement" }), ctx(id))).status).toBe(400);
    const e = await (
      await ADD_J(
        req(`/api/jobs/${id}/journal`, "POST", { kind: "achievement", title: "Shipped search", technologies: "Elasticsearch, go", entryDate: "2024-05-01" }),
        ctx(id),
      )
    ).json();
    await ADD_J(req(`/api/jobs/${id}/journal`, "POST", { kind: "complaint", title: "On-call is brutal" }), ctx(id));

    const listed = await (await LIST_J(req(`/api/jobs/${id}/journal`), ctx(id))).json();
    expect(listed).toHaveLength(2);
    expect(listed.find((x: { id: number }) => x.id === e.id).technologies).toEqual(["Elasticsearch", "go"]);

    const detail = await (await GET_ONE(req(`/api/jobs/${id}`), ctx(id))).json();
    expect(detail.technologies).toEqual(["Go", "Elasticsearch"]);

    expect((await MARK_SYNCED(req("/api/journal/mark-synced", "POST", { entryIds: [e.id] }))).status).toBe(200);
    let [row] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, e.id));
    expect(row.syncedAt).not.toBeNull();

    expect((await PATCH_J(req("/x", "PATCH", { impact: "p95 -40%" }), ctx(e.id))).status).toBe(200);
    [row] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, e.id));
    expect(row.impact).toBe("p95 -40%");
    expect(row.syncedAt).toBeNull();
    expect((await PATCH_J(req("/x", "PATCH", { kind: "rant" }), ctx(e.id))).status).toBe(400);

    expect((await DEL_J(req("/x", "DELETE"), ctx(e.id))).status).toBe(200);
    expect((await DEL_J(req("/x", "DELETE"), ctx(e.id))).status).toBe(404);
  });

  it("mark-synced validates and only touches the caller's entries", async () => {
    expect((await MARK_SYNCED(req("/api/journal/mark-synced", "POST", { entryIds: "1" }))).status).toBe(400);
    const id = await createJob();
    const e = await (await ADD_J(req(`/api/jobs/${id}/journal`, "POST", { title: "Win" }), ctx(id))).json();
    const other = await seedUser("other-journal");
    await MARK_SYNCED(other.req("/api/journal/mark-synced", "POST", { entryIds: [e.id] }));
    const [row] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, e.id));
    expect(row.syncedAt).toBeNull();
    expect((await PATCH_J(other.req("/x", "PATCH", { title: "hax" }), ctx(e.id))).status).toBe(404);
    expect((await DEL_J(other.req("/x", "DELETE"), ctx(e.id))).status).toBe(404);
  });
});
