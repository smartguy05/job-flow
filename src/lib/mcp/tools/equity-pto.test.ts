import { describe, it, expect } from "vitest";
import { db, schema } from "@/db";
import { seedUser } from "@/test/req";
import { NotFoundError } from "@/lib/services/errors";
import { listItems } from "@/lib/services/career-growth";
import { callTool } from "../registry";

async function makeJob(userId: string, company = "Tool Co") {
  const [j] = await db
    .insert(schema.jobs)
    .values({ userId, company, companyNormalized: company.toLowerCase(), title: "Engineer" })
    .returning({ id: schema.jobs.id });
  return j.id;
}

describe("log_pto", () => {
  it("records time off and returns that year's balance", async () => {
    const me = (await seedUser("log-pto-me")).id;
    const jobId = await makeJob(me);
    await db.insert(schema.jobBenefits).values({ userId: me, jobId, ptoDays: 20 });
    const r = (await callTool("log_pto", me, { jobId, startDate: "2026-10-12", endDate: "2026-10-16", note: "Beach" })) as {
      id: number;
      days: number;
      balance: { year: number; used: number; remaining: number };
    };
    expect(r.id).toBeGreaterThan(0);
    expect(r.days).toBe(5);
    expect(r.balance).toMatchObject({ year: 2026, used: 5, remaining: 15 });
    await callTool("log_pto", me, { jobId, startDate: "2026-11-02", days: 0.5, kind: "sick" });
    const list = (await listItems("pto", me, jobId)) as { kind: string }[];
    expect(list.map((e) => e.kind)).toEqual(["sick", "vacation"]);
  });

  it("rejects invalid input and other users' jobs", async () => {
    const me = (await seedUser("log-pto-me-2")).id;
    const jobId = await makeJob(me);
    await expect(callTool("log_pto", me, { jobId })).rejects.toThrow();
    await expect(callTool("log_pto", me, { jobId, startDate: "2026-10-12", kind: "nap" })).rejects.toThrow();
    const other = await seedUser("log-pto-other");
    await expect(callTool("log_pto", other.id, { jobId, startDate: "2026-10-12" })).rejects.toBeInstanceOf(NotFoundError);
    expect(await listItems("pto", me, jobId)).toEqual([]);
  });
});

describe("get_equity_summary", () => {
  it("summarizes all grants, or one job's, without private notes", async () => {
    const me = (await seedUser("equity-tool-me")).id;
    const a = await makeJob(me, "Alpha");
    const b = await makeJob(me, "Beta");
    await db.insert(schema.equityGrants).values([
      { userId: me, jobId: a, vestStart: "2024-01-15", shares: 4800, notes: "PRIVATE-NOTE" },
      { userId: me, jobId: b, vestStart: "2024-01-15", shares: 120, cliffMonths: 0, vestMonths: 12, frequency: "annual" },
    ]);
    const all = (await callTool("get_equity_summary", me, { asOf: "2025-01-15" })) as {
      totals: { vested: number; shares: number };
      grants: unknown[];
    };
    expect(all.totals).toMatchObject({ shares: 4920, vested: 1320 });
    expect(all.grants).toHaveLength(2);
    expect(JSON.stringify(all)).not.toContain("PRIVATE-NOTE");
    const one = (await callTool("get_equity_summary", me, { jobId: b, asOf: "2025-01-15" })) as { grants: unknown[] };
    expect(one.grants).toHaveLength(1);
  });

  it("never shows another user's grants", async () => {
    const me = (await seedUser("equity-tool-owner")).id;
    const jobId = await makeJob(me);
    await db.insert(schema.equityGrants).values({ userId: me, jobId, shares: 100 });
    const other = await seedUser("equity-tool-other");
    expect(((await callTool("get_equity_summary", other.id, {})) as { grants: unknown[] }).grants).toEqual([]);
    await expect(callTool("get_equity_summary", other.id, { jobId })).rejects.toBeInstanceOf(NotFoundError);
  });
});
