import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ extractJobsFromProfile: vi.fn() }));

import { extractJobsFromProfile } from "@/lib/llm";
import { POST } from "./route";
import { POST as CONFIRM } from "./confirm/route";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { req, anonReq, insertApp, seedUser } from "@/test/req";

const mockExtract = vi.mocked(extractJobsFromProfile);

const ACME = { company: "Acme Inc", title: "Developer", startDate: "2019-02-01", endDate: "2022-06-01", technologies: ["Java"], achievements: ["Built billing"] };
const GLOBEX = { company: "Globex", title: "Engineer", startDate: "2022-07-01", endDate: null, technologies: [], achievements: [] };

const me = () => globalThis.__testUserId;

async function wonApp(over: Partial<typeof schema.applications.$inferInsert> = {}, wonAt = new Date("2025-03-10T15:00:00Z")) {
  const id = await insertApp({ status: "closed_won", payMax: 170000, payPeriod: "year", benefits: "PPO", ...over });
  await db.insert(schema.events).values({ userId: me(), applicationId: id, type: "status_change", detail: "in_progress → closed_won", createdAt: wonAt });
  return id;
}

beforeEach(async () => {
  mockExtract.mockReset();
  await db.delete(schema.jobs);
  await db.delete(schema.applications);
  await db.delete(schema.careerProfile);
});

describe("POST /api/jobs/import (preview)", () => {
  it("requires auth", async () => {
    expect((await POST(anonReq("/api/jobs/import", "POST", {}))).status).toBe(401);
    expect((await CONFIRM(anonReq("/api/jobs/import/confirm", "POST", {}))).status).toBe(401);
  });

  it("400s when there is no profile and no won application to import", async () => {
    await insertApp({ status: "in_progress" });
    expect((await POST(req("/api/jobs/import", "POST", {}))).status).toBe(400);
  });

  it("flags profile jobs as exact/possible duplicates, without saving", async () => {
    await db.insert(schema.careerProfile).values({ userId: me(), content: "# Me" });
    await db.insert(schema.jobs).values({ userId: me(), company: "Globex", companyNormalized: "globex", title: "engineer", startDate: "2022-07-01" });
    mockExtract.mockResolvedValue([ACME, GLOBEX, { ...GLOBEX, title: "Senior Engineer", startDate: "2024-01-01" }]);
    const res = await POST(req("/api/jobs/import", "POST", {}));
    expect(res.status).toBe(200);
    const { jobs, applications } = await res.json();
    expect(jobs.map((j: { match: string | null }) => j.match)).toEqual([null, "exact", "possible"]);
    expect(applications).toEqual([]);
    expect(mockExtract.mock.calls[0][0].profile).toBe("# Me");
    expect(await db.select().from(schema.jobs)).toHaveLength(1);
  });

  it("lists won applications without a job, and flags profile jobs at the same company", async () => {
    await db.insert(schema.careerProfile).values({ userId: me(), content: "# Me" });
    const wonId = await wonApp();
    const tracked = await wonApp({ company: "Initech", companyNormalized: "initech" });
    await db.insert(schema.jobs).values({ userId: me(), applicationId: tracked, company: "Initech", companyNormalized: "initech", title: "AI Engineer" });
    await insertApp({ status: "closed_lost", company: "Hooli" });
    const other = await seedUser("other-import");
    await db.insert(schema.applications).values({ userId: other.id, company: "Theirs", companyNormalized: "theirs", roleTitle: "x", status: "closed_won" });
    mockExtract.mockResolvedValue([{ ...GLOBEX, company: "Globex Corporation", title: "AI Engineer", startDate: "2025-01-01" }]);

    const { jobs, applications } = await (await POST(req("/api/jobs/import", "POST", {}))).json();
    expect(applications).toEqual([
      { applicationId: wonId, company: "Globex Corp", roleTitle: "AI Engineer", wonDate: "2025-03-10", pay: "$170k/yr USD", match: null },
    ]);
    expect(jobs[0].match).toBe("possible");
  });

  it("with an empty profile, previews won applications without calling the model", async () => {
    await wonApp();
    const res = await POST(req("/api/jobs/import", "POST", {}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toEqual([]);
    expect(body.applications).toHaveLength(1);
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it("returns 500 when extraction fails", async () => {
    await db.insert(schema.careerProfile).values({ userId: me(), content: "# Me" });
    mockExtract.mockRejectedValue(new Error("bad json"));
    expect((await POST(req("/api/jobs/import", "POST", {}))).status).toBe(500);
  });
});

describe("POST /api/jobs/import/confirm", () => {
  it("validates the payload", async () => {
    expect((await CONFIRM(req("/api/jobs/import/confirm", "POST", { jobs: [{ title: "x" }] }))).status).toBe(400);
    expect((await CONFIRM(req("/api/jobs/import/confirm", "POST", { applicationIds: ["1"] }))).status).toBe(400);
  });

  it("creates jobs + already-synced achievement entries, skipping duplicates", async () => {
    const res = await CONFIRM(req("/api/jobs/import/confirm", "POST", { jobs: [ACME, GLOBEX, ACME] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ created: 2, skipped: 1 });

    const jobs = await db.select().from(schema.jobs);
    const acme = jobs.find((j) => j.company === "Acme Inc")!;
    expect(acme).toMatchObject({ companyNormalized: "acme", startDate: "2019-02-01", endDate: "2022-06-01", technologies: '["Java"]' });
    expect(acme.profileSyncedAt).not.toBeNull();
    const entries = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.jobId, acme.id));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "achievement", title: "Built billing", entryDate: "2022-06-01" });
    expect(entries[0].syncedAt).not.toBeNull();

    const again = await (await CONFIRM(req("/api/jobs/import/confirm", "POST", { jobs: [GLOBEX] }))).json();
    expect(again).toEqual({ created: 0, skipped: 1 });
  });

  it("backfills jobs from won applications, dated by the win, idempotently", async () => {
    const wonId = await wonApp();
    const lost = await insertApp({ status: "closed_lost" });
    const other = await seedUser("other-confirm");
    const [theirs] = await db
      .insert(schema.applications)
      .values({ userId: other.id, company: "Theirs", companyNormalized: "theirs", roleTitle: "x", status: "closed_won" })
      .returning();

    const res = await CONFIRM(req("/api/jobs/import/confirm", "POST", { applicationIds: [wonId, lost, theirs.id] }));
    expect(await res.json()).toEqual({ created: 1, skipped: 2 });
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.applicationId, wonId));
    expect(job).toMatchObject({ userId: me(), company: "Globex Corp", startDate: "2025-03-10" });
    expect(job.profileSyncedAt).toBeNull();
    const comp = await db.select().from(schema.jobCompensation).where(eq(schema.jobCompensation.jobId, job.id));
    expect(comp.map((c) => [c.baseAmount, c.effectiveDate])).toEqual([[170000, "2025-03-10"]]);
    expect(await db.select().from(schema.jobs).where(eq(schema.jobs.applicationId, theirs.id))).toHaveLength(0);

    expect(await (await CONFIRM(req("/api/jobs/import/confirm", "POST", { applicationIds: [wonId] }))).json()).toEqual({ created: 0, skipped: 1 });
  });
});
