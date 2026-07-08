import { describe, it, expect } from "vitest";
import { buildOfferTable, type ComparableApp } from "./offer-comparison";

function app(over: Partial<ComparableApp> = {}): ComparableApp {
  return {
    id: 1,
    company: "Globex",
    roleTitle: "AI Engineer",
    payMin: 180000,
    payMax: 220000,
    payCurrency: "USD",
    payPeriod: "year",
    bonus: "15% target",
    benefits: "health, 401k",
    locationMode: "remote",
    location: "US",
    employmentType: "full-time",
    seniorityLevel: "Senior",
    techStack: "TypeScript, Python",
    companySize: "500-1000",
    companyStage: "Series C",
    industry: "Dev tools",
    interestRating: 4,
    pros: "Great team",
    cons: "Long commute",
    ...over,
  };
}

describe("buildOfferTable", () => {
  it("builds a header entry per application", () => {
    const t = buildOfferTable([app({ id: 1 }), app({ id: 2, company: "Initech" })]);
    expect(t.applications).toEqual([
      { id: 1, company: "Globex", roleTitle: "AI Engineer" },
      { id: 2, company: "Initech", roleTitle: "AI Engineer" },
    ]);
  });

  it("formats pay via formatPay", () => {
    const t = buildOfferTable([app()]);
    const pay = t.rows.find((r) => r.label === "Base pay");
    expect(pay?.values[0]).toBe("$180k–$220k/yr USD");
  });

  it("formats interest rating as N/5 and null when unset", () => {
    const t = buildOfferTable([app({ interestRating: 3 }), app({ id: 2, interestRating: null })]);
    const row = t.rows.find((r) => r.label === "Interest");
    expect(row?.values).toEqual(["3/5", null]);
  });

  it("combines location mode and location", () => {
    const t = buildOfferTable([app({ locationMode: "hybrid", location: "NYC" })]);
    const row = t.rows.find((r) => r.label === "Location");
    expect(row?.values[0]).toBe("hybrid — NYC");
  });

  it("returns null cells for missing fields", () => {
    const t = buildOfferTable([
      app({ payMin: null, payMax: null, bonus: null, benefits: null, techStack: null }),
    ]);
    expect(t.rows.find((r) => r.label === "Base pay")?.values[0]).toBeNull();
    expect(t.rows.find((r) => r.label === "Bonus")?.values[0]).toBeNull();
    expect(t.rows.find((r) => r.label === "Tech stack")?.values[0]).toBeNull();
  });

  it("has one value per application in every row", () => {
    const t = buildOfferTable([app({ id: 1 }), app({ id: 2 }), app({ id: 3 })]);
    for (const row of t.rows) expect(row.values).toHaveLength(3);
  });
});
