import { describe, it, expect } from "vitest";
import { formatPay } from "./job-fields";

describe("formatPay", () => {
  it("returns null when there is no pay data", () => {
    expect(formatPay({})).toBeNull();
    expect(formatPay({ payMin: null, payMax: null })).toBeNull();
  });

  it("formats an annual range in thousands with default USD", () => {
    expect(formatPay({ payMin: 180000, payMax: 220000, payPeriod: "year" })).toBe("$180k–$220k/yr USD");
  });

  it("respects a provided currency", () => {
    expect(formatPay({ payMin: 100000, payMax: 120000, payCurrency: "CAD", payPeriod: "year" })).toContain("CAD");
  });

  it("formats hourly pay without the k suffix", () => {
    expect(formatPay({ payMin: 50, payMax: 60, payPeriod: "hour" })).toBe("$50–$60/hr USD");
  });

  it("collapses a single value when min equals max or only one is set", () => {
    expect(formatPay({ payMin: 200000, payMax: 200000, payPeriod: "year" })).toBe("$200k/yr USD");
    expect(formatPay({ payMin: 150000, payPeriod: "year" })).toBe("$150k/yr USD");
    expect(formatPay({ payMax: 175000, payPeriod: "year" })).toBe("$175k/yr USD");
  });
});
