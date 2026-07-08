import { describe, it, expect } from "vitest";
import { formatPay, pickJobDetails } from "./job-fields";

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

describe("pickJobDetails", () => {
  it("drops foreign fields that the job-details form does not own", () => {
    // Reproduces the notes-erasure bug: JobDetailsPanel spreads the whole detail
    // object (including `notes`) into its state, then re-submits it on save.
    const result = pickJobDetails({
      // Foreign fields that must never be echoed back by the details form:
      notes: "important notes the sidebar just saved",
      jdSnapshot: "job description text",
      roleTitle: "Staff Engineer",
      company: "Acme",
      status: "applied",
      contact: { id: 1, name: "Recruiter" },
      // Real detail fields:
      payMin: 180000,
      location: "Remote",
    });

    expect(result).not.toHaveProperty("notes");
    expect(result).not.toHaveProperty("jdSnapshot");
    expect(result).not.toHaveProperty("roleTitle");
    expect(result).not.toHaveProperty("company");
    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("contact");
    expect(result.payMin).toBe(180000);
    expect(result.location).toBe("Remote");
  });

  it("preserves an explicit null so a detail field can still be cleared", () => {
    const result = pickJobDetails({ bonus: null, payMin: null });
    expect(result).toHaveProperty("bonus", null);
    expect(result).toHaveProperty("payMin", null);
  });

  it("omits absent detail keys rather than setting them to undefined", () => {
    const result = pickJobDetails({ location: "Remote" });
    expect(result).not.toHaveProperty("payMin");
    expect(Object.keys(result)).toEqual(["location"]);
  });
});
