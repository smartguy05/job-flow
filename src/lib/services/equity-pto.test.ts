import { describe, it, expect } from "vitest";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { seedUser } from "@/test/req";
import { NotFoundError, ValidationError } from "./errors";
import { createItem, deleteItem, getEquitySummary, getPtoSummary, listItems, updateItem } from "./career-growth";

const uid = () => globalThis.__testUserId;
async function makeJob(userId: string, company = "Equity Co") {
  const [j] = await db
    .insert(schema.jobs)
    .values({ userId, company, companyNormalized: company.toLowerCase(), title: "Engineer", startDate: "2024-01-01" })
    .returning({ id: schema.jobs.id });
  return j.id;
}

type GrantRow = { id: number; shares: number; cliffMonths: number; vestMonths: number; frequency: string; vesting: { fullyVestedOn: string }; schedule: unknown[] };

describe("equity grants", () => {
  it("creates with column defaults and lists with a derived schedule", async () => {
    const jobId = await makeJob(uid());
    const { id } = await createItem("equity", uid(), jobId, { grantDate: "2024-01-15", shares: 4800 });
    const [g] = (await listItems("equity", uid(), jobId)) as GrantRow[];
    expect(g).toMatchObject({ id, type: "RSU", shares: 4800, cliffMonths: 12, vestMonths: 48, frequency: "monthly" });
    expect(g.vesting.fullyVestedOn).toBe("2028-01-15");
    expect(g.schedule).toHaveLength(37);
  });

  it("validates on create and update, merging with the stored row", async () => {
    const jobId = await makeJob(uid());
    await expect(createItem("equity", uid(), jobId, { grantDate: "2024-01-15" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createItem("equity", uid(), jobId, { shares: 10, vestMonths: 6 })).rejects.toThrow("cliffMonths can't exceed vestMonths");
    const { id } = await createItem("equity", uid(), jobId, { shares: 10, cliffMonths: 0, vestMonths: 12 });
    await expect(updateItem("equity", uid(), jobId, id, { cliffMonths: 24 })).rejects.toBeInstanceOf(ValidationError);
    await updateItem("equity", uid(), jobId, id, { cliffMonths: 6, strikePrice: "1.25" });
    const [g] = (await listItems("equity", uid(), jobId)) as { cliffMonths: number; strikePrice: number }[];
    expect(g).toMatchObject({ cliffMonths: 6, strikePrice: 1.25 });
    await expect(updateItem("equity", uid(), jobId, 999999, { notes: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("summarizes vesting across all jobs or one, without notes", async () => {
    const me = (await seedUser("equity-summary-user")).id;
    const a = await makeJob(me, "Alpha");
    const b = await makeJob(me, "Beta");
    await createItem("equity", me, a, { vestStart: "2024-01-15", shares: 4800, notes: "PRIVATE" });
    await createItem("equity", me, b, { vestStart: "2025-05-20", shares: 400, cliffMonths: 0, vestMonths: 4 });
    const all = await getEquitySummary(me, { asOf: "2025-06-16" });
    expect(all.totals).toMatchObject({ shares: 5200, vested: 1700, unvested: 3500 });
    expect(all.totals.nextVest).toMatchObject({ date: "2025-06-20", shares: 100, company: "Beta" });
    expect(all.grants.map((g) => g.company).sort()).toEqual(["Alpha", "Beta"]);
    expect(JSON.stringify(all)).not.toContain("PRIVATE");
    const one = await getEquitySummary(me, { jobId: a, asOf: "2025-06-16" });
    expect(one.grants).toHaveLength(1);
    expect(one.totals.vested).toBe(1700);
    await expect(getEquitySummary(me, { asOf: "June" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("isolates tenants", async () => {
    const jobId = await makeJob(uid());
    const { id } = await createItem("equity", uid(), jobId, { shares: 100 });
    const other = await seedUser("equity-svc-other");
    await expect(listItems("equity", other.id, jobId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateItem("equity", other.id, jobId, id, { shares: 1 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteItem("equity", other.id, jobId, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getEquitySummary(other.id, { jobId })).rejects.toBeInstanceOf(NotFoundError);
    expect((await getEquitySummary(other.id, {})).grants).toEqual([]);
    // Another of my own jobs can't reach this grant either.
    const mine2 = await makeJob(uid(), "Other Mine");
    await expect(updateItem("equity", uid(), mine2, id, { shares: 1 })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("PTO", () => {
  it("defaults end date and weekdays, recomputes on range change, lists newest first", async () => {
    const jobId = await makeJob(uid());
    const { id } = await createItem("pto", uid(), jobId, { startDate: "2026-10-12", endDate: "2026-10-16" });
    await createItem("pto", uid(), jobId, { startDate: "2026-12-25", kind: "holiday" });
    let list = (await listItems("pto", uid(), jobId)) as { id: number; startDate: string; endDate: string; days: number }[];
    expect(list.map((e) => e.startDate)).toEqual(["2026-12-25", "2026-10-12"]);
    expect(list[0]).toMatchObject({ endDate: "2026-12-25", days: 1 });
    expect(list[1].days).toBe(5);
    await updateItem("pto", uid(), jobId, id, { endDate: "2026-10-13" });
    list = (await listItems("pto", uid(), jobId)) as typeof list;
    expect(list[1]).toMatchObject({ endDate: "2026-10-13", days: 2 });
    await expect(updateItem("pto", uid(), jobId, id, { endDate: "2026-10-01" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("computes the balance against the benefits allowance", async () => {
    const jobId = await makeJob(uid());
    await db.insert(schema.jobBenefits).values({ userId: uid(), jobId, ptoDays: 20 });
    await createItem("pto", uid(), jobId, { startDate: "2026-03-02", endDate: "2026-03-06" });
    await createItem("pto", uid(), jobId, { startDate: "2026-04-01", days: 0.5, kind: "sick" });
    await createItem("pto", uid(), jobId, { startDate: "2025-12-01", days: 3 });
    const b = await getPtoSummary(uid(), jobId, 2026);
    expect(b).toMatchObject({ year: 2026, allowance: 20, used: 5, remaining: 15, byKind: { sick: 0.5 } });
    expect((await getPtoSummary(uid(), jobId)).year).toBe(new Date().getUTCFullYear());
    await db.delete(schema.jobBenefits).where(eq(schema.jobBenefits.jobId, jobId));
    expect((await getPtoSummary(uid(), jobId, 2026)).remaining).toBeNull();
    await expect(getPtoSummary(uid(), jobId, 99)).rejects.toBeInstanceOf(ValidationError);
  });

  it("isolates tenants", async () => {
    const jobId = await makeJob(uid());
    const { id } = await createItem("pto", uid(), jobId, { startDate: "2026-10-12" });
    const other = await seedUser("pto-svc-other");
    await expect(createItem("pto", other.id, jobId, { startDate: "2026-10-12" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateItem("pto", other.id, jobId, id, { days: 3 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPtoSummary(other.id, jobId, 2026)).rejects.toBeInstanceOf(NotFoundError);
    const [row] = await db.select().from(schema.ptoEntries).where(eq(schema.ptoEntries.id, id));
    expect(row.days).toBe(1);
  });
});
