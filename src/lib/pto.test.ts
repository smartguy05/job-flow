import { describe, it, expect } from "vitest";
import { businessDays, ptoBalance, type PtoLike } from "./pto";

describe("businessDays", () => {
  it.each([
    ["2026-10-12", "2026-10-16", 5], // Mon–Fri
    ["2026-10-12", "2026-10-12", 1], // single weekday
    ["2026-10-17", "2026-10-18", 0], // a weekend
    ["2026-10-16", "2026-10-19", 2], // Fri–Mon
    ["2026-10-12", "2026-10-25", 10], // two weeks
    ["2026-12-28", "2027-01-01", 5], // across the year end
    ["2026-10-16", "2026-10-12", 0], // reversed range
  ])("%s → %s = %i", (a, b, n) => {
    expect(businessDays(a, b)).toBe(n);
  });
});

const e = (startDate: string, days: number, kind = "vacation"): PtoLike => ({ startDate, days, kind });

describe("ptoBalance", () => {
  it("deducts vacation and other from the allowance; sick and holidays are tracked separately", () => {
    const b = ptoBalance(20, [e("2026-03-02", 5), e("2026-07-01", 2.5, "other"), e("2026-02-01", 3, "sick"), e("2026-12-25", 1, "holiday")], 2026);
    expect(b).toEqual({
      year: 2026,
      allowance: 20,
      used: 7.5,
      remaining: 12.5,
      byKind: { vacation: 5, sick: 3, holiday: 1, other: 2.5 },
      entries: 4,
    });
  });

  it("only counts entries that start in the year", () => {
    const b = ptoBalance(15, [e("2025-12-29", 3), e("2026-01-05", 2), e("2027-01-02", 4)], 2026);
    expect(b.used).toBe(2);
    expect(b.remaining).toBe(13);
    expect(b.entries).toBe(1);
  });

  it("can go negative when over the allowance", () => {
    expect(ptoBalance(2, [e("2026-05-01", 5)], 2026).remaining).toBe(-3);
  });

  it("has no remaining balance without an allowance", () => {
    const b = ptoBalance(null, [e("2026-05-01", 1)], 2026);
    expect(b.allowance).toBeNull();
    expect(b.remaining).toBeNull();
    expect(b.used).toBe(1);
  });

  it("buckets unknown kinds as other and ignores missing day counts", () => {
    const b = ptoBalance(10, [e("2026-05-01", 1, "jury"), { startDate: "2026-06-01", days: null, kind: "vacation" }], 2026);
    expect(b.byKind.other).toBe(1);
    expect(b.used).toBe(1);
  });

  it("is empty for a year with no entries", () => {
    expect(ptoBalance(10, [], 2026)).toMatchObject({ used: 0, remaining: 10, entries: 0 });
  });
});
