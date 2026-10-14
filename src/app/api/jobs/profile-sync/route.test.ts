import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ assistCareerProfile: vi.fn() }));

import { assistCareerProfile } from "@/lib/llm";
import { POST } from "./route";
import { POST as MARK_SYNCED } from "../../journal/mark-synced/route";
import { PATCH as PATCH_JOB } from "../[id]/route";
import { db, schema } from "@/db";
import { req, anonReq, ctx, seedUser } from "@/test/req";

const mockAssist = vi.mocked(assistCareerProfile);

async function seedJob(over: Partial<typeof schema.jobs.$inferInsert> = {}) {
  const [job] = await db
    .insert(schema.jobs)
    .values({ userId: globalThis.__testUserId, company: "Globex", companyNormalized: "globex", title: "Engineer", startDate: "2024-01-01", ...over })
    .returning();
  return job;
}

beforeEach(async () => {
  mockAssist.mockReset();
  mockAssist.mockResolvedValue("# Profile\nnew stuff");
  await db.delete(schema.jobs);
  await db.delete(schema.careerProfile);
  await db.insert(schema.careerProfile).values({ userId: globalThis.__testUserId, content: "# Profile" });
});

describe("POST /api/jobs/profile-sync", () => {
  it("requires auth", async () => {
    expect((await POST(anonReq("/api/jobs/profile-sync", "POST", {}))).status).toBe(401);
  });

  it("400s when nothing is pending", async () => {
    await seedJob({ profileSyncedAt: new Date() });
    const res = await POST(req("/api/jobs/profile-sync", "POST", {}));
    expect(res.status).toBe(400);
    expect(mockAssist).not.toHaveBeenCalled();
  });

  it("proposes an update from unsynced jobs + achievements, excluding complaints, without saving", async () => {
    const job = await seedJob();
    await db.insert(schema.jobCompensation).values([
      { userId: globalThis.__testUserId, jobId: job.id, kind: "start", title: "Engineer", baseAmount: 123456, effectiveDate: "2024-01-01" },
      { userId: globalThis.__testUserId, jobId: job.id, kind: "promotion", title: "Senior Engineer", baseAmount: 150000, effectiveDate: "2025-01-01" },
    ]);
    const [win] = await db
      .insert(schema.journalEntries)
      .values({ userId: globalThis.__testUserId, jobId: job.id, kind: "achievement", title: "Shipped search" })
      .returning();
    const [gripe] = await db
      .insert(schema.journalEntries)
      .values({ userId: globalThis.__testUserId, jobId: job.id, kind: "complaint", title: "Endless meetings" })
      .returning();

    const res = await POST(req("/api/jobs/profile-sync", "POST", {}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ current: "# Profile", proposed: "# Profile\nnew stuff", entryIds: [win.id], jobIds: [job.id] });

    const { instruction, current } = mockAssist.mock.calls[0][0];
    expect(current).toBe("# Profile");
    expect(instruction).toContain("Shipped search");
    expect(instruction).toContain("Engineer → Senior Engineer");
    expect(instruction).not.toContain("Endless meetings");
    expect(instruction).not.toContain("123456");
    expect(gripe.id).not.toBe(win.id);

    const [profile] = await db.select().from(schema.careerProfile);
    expect(profile.content).toBe("# Profile");
  });

  it("after mark-synced nothing is pending; editing the job makes it pending again", async () => {
    const job = await seedJob();
    const first = await (await POST(req("/api/jobs/profile-sync", "POST", {}))).json();
    await MARK_SYNCED(req("/api/journal/mark-synced", "POST", { entryIds: first.entryIds, jobIds: first.jobIds }));
    expect((await POST(req("/api/jobs/profile-sync", "POST", {}))).status).toBe(400);

    await PATCH_JOB(req(`/api/jobs/${job.id}`, "PATCH", { endDate: "2026-01-01" }), ctx(job.id));
    expect((await POST(req("/api/jobs/profile-sync", "POST", {}))).status).toBe(200);
  });

  it("explicit jobIds include that job even if already synced, scoped to the user", async () => {
    const job = await seedJob({ profileSyncedAt: new Date() });
    const res = await POST(req("/api/jobs/profile-sync", "POST", { jobIds: [job.id] }));
    expect(res.status).toBe(200);
    expect((await res.json()).jobIds).toEqual([job.id]);

    const other = await seedUser("other-sync");
    expect((await POST(other.req("/api/jobs/profile-sync", "POST", { jobIds: [job.id] }))).status).toBe(400);
  });

  it("returns 500 when the model fails", async () => {
    await seedJob();
    mockAssist.mockRejectedValue(new Error("boom"));
    const res = await POST(req("/api/jobs/profile-sync", "POST", {}));
    expect(res.status).toBe(500);
  });
});
