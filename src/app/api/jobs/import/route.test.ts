import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ extractJobsFromProfile: vi.fn() }));

import { extractJobsFromProfile } from "@/lib/llm";
import { POST } from "./route";
import { POST as CONFIRM } from "./confirm/route";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { req, anonReq } from "@/test/req";

const mockExtract = vi.mocked(extractJobsFromProfile);

const ACME = { company: "Acme Inc", title: "Developer", startDate: "2019-02-01", endDate: "2022-06-01", technologies: ["Java"], achievements: ["Built billing"] };
const GLOBEX = { company: "Globex", title: "Engineer", startDate: "2022-07-01", endDate: null, technologies: [], achievements: [] };

beforeEach(async () => {
  mockExtract.mockReset();
  await db.delete(schema.jobs);
  await db.delete(schema.careerProfile);
});

describe("POST /api/jobs/import (preview)", () => {
  it("requires auth", async () => {
    expect((await POST(anonReq("/api/jobs/import", "POST", {}))).status).toBe(401);
    expect((await CONFIRM(anonReq("/api/jobs/import/confirm", "POST", {}))).status).toBe(401);
  });

  it("400s with an empty profile", async () => {
    expect((await POST(req("/api/jobs/import", "POST", {}))).status).toBe(400);
  });

  it("returns extracted jobs flagged as duplicates when already tracked, without saving", async () => {
    await db.insert(schema.careerProfile).values({ userId: globalThis.__testUserId, content: "# Me" });
    await db.insert(schema.jobs).values({ userId: globalThis.__testUserId, company: "Globex", companyNormalized: "globex", title: "engineer", startDate: "2022-07-01" });
    mockExtract.mockResolvedValue([ACME, GLOBEX]);
    const res = await POST(req("/api/jobs/import", "POST", {}));
    expect(res.status).toBe(200);
    const { jobs } = await res.json();
    expect(jobs.map((j: { duplicate: boolean }) => j.duplicate)).toEqual([false, true]);
    expect(mockExtract.mock.calls[0][0].profile).toBe("# Me");
    expect(await db.select().from(schema.jobs)).toHaveLength(1);
  });

  it("returns 500 when extraction fails", async () => {
    await db.insert(schema.careerProfile).values({ userId: globalThis.__testUserId, content: "# Me" });
    mockExtract.mockRejectedValue(new Error("bad json"));
    expect((await POST(req("/api/jobs/import", "POST", {}))).status).toBe(500);
  });
});

describe("POST /api/jobs/import/confirm", () => {
  it("validates the payload", async () => {
    expect((await CONFIRM(req("/api/jobs/import/confirm", "POST", { jobs: [{ title: "x" }] }))).status).toBe(400);
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
});
