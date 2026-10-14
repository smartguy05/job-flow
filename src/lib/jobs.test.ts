import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { insertApp } from "@/test/req";
import {
  parseTechList,
  mergeTechnologies,
  jobFromApplication,
  compSummary,
  tenureMonths,
  createJobFromApplication,
  matchExisting,
  wonDateFrom,
} from "./jobs";

describe("parseTechList", () => {
  it("parses a JSON string array and tolerates junk", () => {
    expect(parseTechList('["Go","Postgres"]')).toEqual(["Go", "Postgres"]);
    expect(parseTechList("not json")).toEqual([]);
    expect(parseTechList('{"a":1}')).toEqual([]);
    expect(parseTechList(null)).toEqual([]);
    expect(parseTechList('["Go", 3, ""]')).toEqual(["Go"]);
  });
});

describe("mergeTechnologies", () => {
  it("dedupes case-insensitively, keeps first spelling, trims", () => {
    expect(mergeTechnologies(["Go", " postgres "], ["go", "Postgres", "Kafka"])).toEqual(["Go", "postgres", "Kafka"]);
  });
  it("drops empties", () => {
    expect(mergeTechnologies(["", "  "], [])).toEqual([]);
  });
});

describe("jobFromApplication", () => {
  const base = {
    company: "Globex Corp",
    roleTitle: "AI Engineer",
    employmentType: "full-time",
    locationMode: "remote",
    location: "US",
    payMin: 150000,
    payMax: 180000,
    payCurrency: "USD",
    payPeriod: "year",
    bonus: "10%",
    benefits: "Health, 401k 4%",
    techStack: "Python, Go, python",
  };

  it("maps an application to a job, starting comp and benefits", () => {
    const r = jobFromApplication(base, "2026-10-14");
    expect(r.job).toMatchObject({
      company: "Globex Corp",
      companyNormalized: "globex",
      title: "AI Engineer",
      startDate: "2026-10-14",
      employmentType: "full-time",
      locationMode: "remote",
      location: "US",
    });
    expect(JSON.parse(r.job.technologies)).toEqual(["Python", "Go"]);
    expect(r.comp).toEqual({
      kind: "start",
      effectiveDate: "2026-10-14",
      title: "AI Engineer",
      baseAmount: 180000,
      currency: "USD",
      period: "year",
      bonus: "10%",
    });
    expect(r.benefits).toEqual({ other: "Health, 401k 4%" });
  });

  it("falls back to payMin and omits comp/benefits when absent", () => {
    expect(jobFromApplication({ ...base, payMax: null }, "2026-01-01").comp?.baseAmount).toBe(150000);
    const bare = jobFromApplication(
      { company: "X", roleTitle: "Dev", payMin: null, payMax: null, bonus: null, benefits: null },
      "2026-01-01",
    );
    expect(bare.comp).toBeNull();
    expect(bare.benefits).toBeNull();
    expect(JSON.parse(bare.job.technologies)).toEqual([]);
  });
});

describe("compSummary", () => {
  it("orders steps by date and computes raise % and total growth", () => {
    const s = compSummary([
      { id: 2, effectiveDate: "2025-01-01", kind: "raise", baseAmount: 110000, currency: "USD", period: "year", title: null },
      { id: 1, effectiveDate: "2024-01-01", kind: "start", baseAmount: 100000, currency: "USD", period: "year", title: "Engineer" },
      { id: 4, effectiveDate: "2025-06-01", kind: "bonus_payout", baseAmount: null, currency: "USD", period: "year", title: null },
      { id: 3, effectiveDate: "2026-01-01", kind: "promotion", baseAmount: 132000, currency: "USD", period: "year", title: "Senior Engineer" },
    ]);
    expect(s.steps.map((x) => x.id)).toEqual([1, 2, 4, 3]);
    expect(s.steps.find((x) => x.id === 2)?.changePct).toBe(10);
    expect(s.steps.find((x) => x.id === 3)?.changePct).toBe(20);
    expect(s.steps.find((x) => x.id === 4)?.changePct).toBeNull();
    expect(s.current).toEqual({ baseAmount: 132000, currency: "USD", period: "year" });
    expect(s.totalGrowthPct).toBe(32);
    expect(s.titles).toEqual(["Engineer", "Senior Engineer"]);
  });

  it("handles no base-pay rows", () => {
    const s = compSummary([]);
    expect(s.current).toBeNull();
    expect(s.totalGrowthPct).toBeNull();
    expect(s.steps).toEqual([]);
  });
});

describe("tenureMonths", () => {
  it("counts whole months between start and end (or today)", () => {
    expect(tenureMonths("2024-01-15", "2025-03-14", "2099-01-01")).toBe(13);
    expect(tenureMonths("2024-01-15", null, "2024-07-15")).toBe(6);
    expect(tenureMonths(null, null, "2024-07-15")).toBeNull();
  });
});

describe("createJobFromApplication", () => {
  it("creates a job with comp + benefits once (idempotent)", async () => {
    const appId = await insertApp({ payMax: 200000, payPeriod: "year", benefits: "Great health" });
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, appId));
    const first = await createJobFromApplication(globalThis.__testUserId, app, "2026-10-14");
    expect(first).toBeTypeOf("number");
    const again = await createJobFromApplication(globalThis.__testUserId, app, "2026-10-14");
    expect(again).toBe(first);

    const jobs = await db.select().from(schema.jobs).where(eq(schema.jobs.applicationId, appId));
    expect(jobs).toHaveLength(1);
    const comp = await db.select().from(schema.jobCompensation).where(eq(schema.jobCompensation.jobId, first!));
    expect(comp).toHaveLength(1);
    expect(comp[0].baseAmount).toBe(200000);
    const [ben] = await db.select().from(schema.jobBenefits).where(eq(schema.jobBenefits.jobId, first!));
    expect(ben.other).toBe("Great health");
  });
});

describe("matchExisting", () => {
  const existing = [{ company: "Globex Corp", title: "AI Engineer", startDate: "2026-10-14" }];
  it("is exact on company + start date + title", () => {
    expect(matchExisting({ company: "globex", title: "ai engineer ", startDate: "2026-10-14" }, existing)).toBe("exact");
  });
  it("is possible when only the company matches", () => {
    expect(matchExisting({ company: "Globex Inc", title: "Senior AI Engineer", startDate: "2026-09-01" }, existing)).toBe("possible");
  });
  it("is null for a different company", () => {
    expect(matchExisting({ company: "Initech", title: "AI Engineer", startDate: "2026-10-14" }, existing)).toBeNull();
    expect(matchExisting({ company: "Globex", title: "x", startDate: null }, [])).toBeNull();
  });
});

describe("wonDateFrom", () => {
  const fallback = new Date("2026-03-03T12:00:00Z");
  it("uses the latest status change into closed_won", () => {
    expect(
      wonDateFrom(
        [
          { type: "status_change", detail: "in_progress → closed_won", createdAt: new Date("2025-01-10T10:00:00Z") },
          { type: "status_change", detail: "closed_won → in_progress", createdAt: new Date("2025-02-01T10:00:00Z") },
          { type: "status_change", detail: "in_progress → closed_won", createdAt: new Date("2025-02-05T10:00:00Z") },
          { type: "note", detail: "→ closed_won", createdAt: new Date("2025-06-01T10:00:00Z") },
        ],
        fallback,
      ),
    ).toBe("2025-02-05");
  });
  it("falls back when no such event exists", () => {
    expect(wonDateFrom([{ type: "created", detail: null, createdAt: new Date("2024-01-01") }], fallback)).toBe("2026-03-03");
  });
});
