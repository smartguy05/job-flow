import { describe, it, expect } from "vitest";
import { addMonths, equityGrantSummary, equityTotals, nextVest, vestedAsOf, vestingSchedule, type VestGrant } from "./vesting";

const grant = (over: Partial<VestGrant> = {}): VestGrant => ({
  grantDate: "2024-01-15",
  vestStart: "2024-01-15",
  shares: 4800,
  cliffMonths: 12,
  vestMonths: 48,
  frequency: "monthly",
  ...over,
});

describe("addMonths", () => {
  it.each([
    ["2024-01-15", 1, "2024-02-15"],
    ["2024-01-31", 1, "2024-02-29"], // leap year clamp
    ["2023-01-31", 1, "2023-02-28"],
    ["2024-03-31", 1, "2024-04-30"],
    ["2024-11-30", 3, "2025-02-28"],
    ["2024-12-15", 12, "2025-12-15"],
    ["2024-05-10", 0, "2024-05-10"],
  ])("%s + %i months = %s", (from, n, want) => {
    expect(addMonths(from, n)).toBe(want);
  });
});

describe("vestingSchedule", () => {
  it("monthly with a one-year cliff: the cliff releases a year's worth, then monthly", () => {
    const s = vestingSchedule(grant());
    expect(s).toHaveLength(37); // cliff + 36 monthly
    expect(s[0]).toEqual({ date: "2025-01-15", shares: 1200, cumulative: 1200 });
    expect(s[1]).toEqual({ date: "2025-02-15", shares: 100, cumulative: 1300 });
    expect(s[36]).toEqual({ date: "2028-01-15", shares: 100, cumulative: 4800 });
  });

  it("quarterly 4-year with a 12-month cliff", () => {
    const s = vestingSchedule(grant({ shares: 1000, frequency: "quarterly" }));
    expect(s.map((e) => e.date)).toEqual([
      "2025-01-15", "2025-04-15", "2025-07-15", "2025-10-15",
      "2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15",
      "2027-01-15", "2027-04-15", "2027-07-15", "2027-10-15", "2028-01-15",
    ]);
    expect(s[0]).toMatchObject({ shares: 250, cumulative: 250 });
    expect(s[1]).toMatchObject({ shares: 62, cumulative: 312 }); // floor(1000*15/48)
    expect(s.at(-1)!.cumulative).toBe(1000);
    expect(s.reduce((a, e) => a + e.shares, 0)).toBe(1000);
  });

  it("annual with no cliff", () => {
    const s = vestingSchedule(grant({ shares: 1000, cliffMonths: 0, frequency: "annual" }));
    expect(s).toEqual([
      { date: "2025-01-15", shares: 250, cumulative: 250 },
      { date: "2026-01-15", shares: 250, cumulative: 500 },
      { date: "2027-01-15", shares: 250, cumulative: 750 },
      { date: "2028-01-15", shares: 250, cumulative: 1000 },
    ]);
  });

  it("a cliff off the frequency boundary vests on the cliff date, then resumes on the grid", () => {
    const s = vestingSchedule(grant({ shares: 1200, cliffMonths: 4, vestMonths: 12, frequency: "quarterly" }));
    expect(s.map((e) => [e.date, e.cumulative])).toEqual([
      ["2024-05-15", 400],
      ["2024-07-15", 600],
      ["2024-10-15", 900],
      ["2025-01-15", 1200],
    ]);
  });

  it("a vesting period that is not a multiple of the frequency still ends on the last month", () => {
    const s = vestingSchedule(grant({ shares: 300, cliffMonths: 0, vestMonths: 30, frequency: "annual" }));
    expect(s.map((e) => [e.date, e.cumulative])).toEqual([
      ["2025-01-15", 120],
      ["2026-01-15", 240],
      ["2026-07-15", 300],
    ]);
  });

  it("rounds down each step and puts the remainder on the last vest", () => {
    const s = vestingSchedule(grant({ shares: 100, cliffMonths: 0, vestMonths: 3 }));
    expect(s.map((e) => e.shares)).toEqual([33, 33, 34]);
  });

  it("skips steps where no whole share vests", () => {
    const s = vestingSchedule(grant({ shares: 2, cliffMonths: 0, vestMonths: 4 }));
    expect(s.map((e) => [e.date, e.cumulative])).toEqual([
      ["2024-03-15", 1],
      ["2024-05-15", 2],
    ]);
  });

  it("vestMonths 0 vests everything at the vest start (e.g. ESPP)", () => {
    expect(vestingSchedule(grant({ shares: 50, cliffMonths: 0, vestMonths: 0 }))).toEqual([
      { date: "2024-01-15", shares: 50, cumulative: 50 },
    ]);
  });

  it("a cliff equal to the whole period is a single cliff vest", () => {
    expect(vestingSchedule(grant({ shares: 90, cliffMonths: 36, vestMonths: 36 }))).toEqual([
      { date: "2027-01-15", shares: 90, cumulative: 90 },
    ]);
  });

  it("a cliff longer than the period is clamped to the period", () => {
    expect(vestingSchedule(grant({ shares: 90, cliffMonths: 60, vestMonths: 36 }))).toHaveLength(1);
  });

  it("falls back to the grant date when there is no vest start", () => {
    expect(vestingSchedule(grant({ vestStart: null, grantDate: "2024-03-01", shares: 12, cliffMonths: 0, vestMonths: 12, frequency: "annual" })))
      .toEqual([{ date: "2025-03-01", shares: 12, cumulative: 12 }]);
  });

  it("month-end vest starts clamp to the end of shorter months", () => {
    const s = vestingSchedule(grant({ vestStart: "2024-01-31", shares: 3, cliffMonths: 0, vestMonths: 3 }));
    expect(s.map((e) => e.date)).toEqual(["2024-02-29", "2024-03-31", "2024-04-30"]);
  });

  it("returns nothing for no shares or no start date", () => {
    expect(vestingSchedule(grant({ shares: 0 }))).toEqual([]);
    expect(vestingSchedule(grant({ vestStart: null, grantDate: null }))).toEqual([]);
  });
});

describe("vestedAsOf / nextVest", () => {
  const g = grant();
  it.each([
    ["2024-06-01", 0, { date: "2025-01-15", shares: 1200 }], // before the cliff
    ["2025-01-14", 0, { date: "2025-01-15", shares: 1200 }], // day before the cliff
    ["2025-01-15", 1200, { date: "2025-02-15", shares: 100 }], // on the cliff (inclusive)
    ["2025-02-14", 1200, { date: "2025-02-15", shares: 100 }],
    ["2025-02-15", 1300, { date: "2025-03-15", shares: 100 }],
    ["2026-07-20", 3000, { date: "2026-08-15", shares: 100 }],
    ["2028-01-14", 4700, { date: "2028-01-15", shares: 100 }], // day before the last vest
    ["2028-01-15", 4800, null], // fully vested
    ["2030-01-01", 4800, null],
  ])("as of %s: %i vested, next %o", (asOf, vested, next) => {
    expect(vestedAsOf(g, asOf)).toBe(vested);
    expect(nextVest(g, asOf)).toEqual(next);
  });
});

describe("equityGrantSummary / equityTotals", () => {
  it("summarizes one grant", () => {
    expect(equityGrantSummary(grant(), "2025-06-01")).toEqual({
      vested: 1600,
      unvested: 3200,
      nextVest: { date: "2025-06-15", shares: 100 },
      fullyVestedOn: "2028-01-15",
    });
  });

  it("totals several grants and picks the soonest next vest", () => {
    const a = { ...grant(), id: 1 };
    const b = { ...grant({ vestStart: "2025-05-20", shares: 400, cliffMonths: 0, vestMonths: 4 }), id: 2 };
    const t = equityTotals([a, b], "2025-06-01");
    expect(t).toEqual({ shares: 5200, vested: 1600, unvested: 3600, nextVest: { date: "2025-06-15", shares: 100, grantId: 1 } });
    expect(equityTotals([a, b], "2025-06-16").nextVest).toEqual({ date: "2025-06-20", shares: 100, grantId: 2 });
    expect(equityTotals([], "2025-06-01")).toEqual({ shares: 0, vested: 0, unvested: 0, nextVest: null });
  });
});
