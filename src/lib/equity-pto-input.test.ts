import { describe, it, expect } from "vitest";
import { equityInput, finalizeGrant, finalizePto, ptoInput } from "./career-growth";
import { parseBody } from "./job-input";

describe("parseBody nums", () => {
  it("keeps decimals and strips currency formatting", () => {
    expect(parseBody({ x: "$1,234.50", y: 0.5, z: "" }, { nums: ["x", "y", "z"] }, false).values).toEqual({ x: 1234.5, y: 0.5, z: null });
    expect(parseBody({ x: "abc" }, { nums: ["x"] }, false).error).toBe("x must be a number");
  });
});

describe("equityInput", () => {
  it("parses a full grant", () => {
    const r = equityInput(
      { type: "ISO", grantDate: "2024-01-15", shares: "4,800", strikePrice: "$2.15", cliffMonths: 12, vestMonths: "48", frequency: "quarterly", notes: " n " },
      { create: true },
    );
    expect(r).toEqual({
      values: { type: "ISO", grantDate: "2024-01-15", shares: 4800, strikePrice: 2.15, cliffMonths: 12, vestMonths: 48, frequency: "quarterly", notes: "n" },
    });
  });

  it.each([
    [{}, "shares required"],
    [{ shares: 0 }, "shares must be greater than 0"],
    [{ shares: 10, type: "warrant" }, "type must be one of RSU, ISO, NSO, ESPP, other"],
    [{ shares: 10, frequency: "weekly" }, "frequency must be one of monthly, quarterly, annual"],
    [{ shares: 10, cliffMonths: -1 }, "cliffMonths must be 0 or more"],
    [{ shares: 10, vestMonths: -12 }, "vestMonths must be 0 or more"],
    [{ shares: 10, strikePrice: -1 }, "strikePrice must be 0 or more"],
    [{ shares: 10, grantDate: "Jan 2024" }, "grantDate must be YYYY-MM-DD"],
  ])("create %o → %s", (body, error) => {
    expect(equityInput(body, { create: true }).error).toBe(error);
  });

  it("on update only touches present fields; a blank NOT NULL month field is left alone", () => {
    expect(equityInput({ notes: "x", cliffMonths: "" })).toEqual({ values: { notes: "x" } });
    expect(equityInput({ shares: null }).error).toBe("shares must be greater than 0");
  });
});

describe("finalizeGrant", () => {
  it("rejects a cliff longer than the vesting period, using stored values for missing fields", () => {
    expect(finalizeGrant({ cliffMonths: 60 }, { cliffMonths: 12, vestMonths: 48 }).error).toBe("cliffMonths can't exceed vestMonths");
    expect(finalizeGrant({ cliffMonths: 60, vestMonths: 12 }, null).error).toBe("cliffMonths can't exceed vestMonths");
    expect(finalizeGrant({ vestMonths: 24 }, { cliffMonths: 12, vestMonths: 48 }).error).toBeUndefined();
  });
  it("uses the column defaults on create", () => {
    expect(finalizeGrant({ shares: 1 }, null).error).toBeUndefined();
    expect(finalizeGrant({ shares: 1, vestMonths: 6 }, null).error).toBe("cliffMonths can't exceed vestMonths");
  });
});

describe("ptoInput / finalizePto", () => {
  it("parses an entry", () => {
    expect(ptoInput({ startDate: "2026-10-12", endDate: "2026-10-16", days: "4.5", kind: "sick", note: "flu" }, { create: true })).toEqual({
      values: { startDate: "2026-10-12", endDate: "2026-10-16", days: 4.5, kind: "sick", note: "flu" },
    });
  });

  it.each([
    [{}, "startDate required"],
    [{ startDate: "" }, "startDate required"],
    [{ startDate: "2026-10-12", kind: "sabbatical" }, "kind must be one of vacation, sick, holiday, other"],
    [{ startDate: "2026-10-12", days: -1 }, "days must be 0 or more"],
  ])("create %o → %s", (body, error) => {
    expect(ptoInput(body, { create: true }).error).toBe(error);
  });

  it("can't clear the start date on update", () => {
    expect(ptoInput({ startDate: null }).error).toBe("startDate required");
    expect(ptoInput({ note: "x" })).toEqual({ values: { note: "x" } });
  });

  it("defaults the end date to the start and the days to weekdays in the range", () => {
    expect(finalizePto({ startDate: "2026-10-12" }, null)).toEqual({ values: { startDate: "2026-10-12", endDate: "2026-10-12", days: 1 } });
    expect(finalizePto({ startDate: "2026-10-12", endDate: "2026-10-19" }, null).values.days).toBe(6);
    expect(finalizePto({ startDate: "2026-10-12", endDate: "2026-10-19", days: 2 }, null).values.days).toBe(2);
  });

  it("recomputes days when the range changes on update, unless days are given", () => {
    const existing = { startDate: "2026-10-12", endDate: "2026-10-12", days: 1 };
    expect(finalizePto({ endDate: "2026-10-14" }, existing).values).toEqual({ endDate: "2026-10-14", days: 3 });
    expect(finalizePto({ note: "x" }, existing).values).toEqual({ note: "x" });
    expect(finalizePto({ endDate: "2026-10-14", days: 0.5 }, existing).values.days).toBe(0.5);
  });

  it("rejects an end before the start", () => {
    expect(finalizePto({ startDate: "2026-10-12", endDate: "2026-10-01" }, null).error).toBe("endDate can't be before startDate");
    expect(finalizePto({ endDate: "2026-10-01" }, { startDate: "2026-10-12", endDate: "2026-10-12", days: 1 }).error).toBe(
      "endDate can't be before startDate",
    );
  });
});
