import { describe, it, expect } from "vitest";
import { jobInput, compInput, benefitsInput, journalInput } from "./job-input";

describe("jobInput", () => {
  it("picks only provided fields, trims, nulls blanks, normalizes company + tech", () => {
    const r = jobInput({ company: " Acme Inc ", title: "Dev", endDate: "", team: "  ", technologies: "Go, go ,Rust", junk: 1 });
    expect(r.error).toBeUndefined();
    expect(r.values).toEqual({
      company: "Acme Inc",
      companyNormalized: "acme",
      title: "Dev",
      endDate: null,
      team: null,
      technologies: '["Go","Rust"]',
    });
  });
  it("rejects blank required fields and bad dates", () => {
    expect(jobInput({ company: "" }).error).toMatch(/company/);
    expect(jobInput({ title: " " }).error).toMatch(/title/);
    expect(jobInput({ startDate: "June" }).error).toMatch(/startDate/);
  });
  it("requires company and title on create", () => {
    expect(jobInput({ company: "A" }, { create: true }).error).toMatch(/title/);
  });
});

describe("compInput", () => {
  it("validates kind/period and coerces amounts", () => {
    expect(compInput({ kind: "raise", baseAmount: "120000", period: "year", effectiveDate: "2025-01-01" }).values).toEqual({
      kind: "raise",
      baseAmount: 120000,
      period: "year",
      effectiveDate: "2025-01-01",
    });
    expect(compInput({ baseAmount: "" }).values).toEqual({ baseAmount: null });
    expect(compInput({ kind: "lottery" }).error).toMatch(/kind/);
    expect(compInput({ period: "week" }).error).toMatch(/period/);
    expect(compInput({ baseAmount: "lots" }).error).toMatch(/baseAmount/);
  });
});

describe("benefitsInput", () => {
  it("coerces ptoDays and trims text", () => {
    expect(benefitsInput({ ptoDays: "20", health: " PPO ", other: "" }).values).toEqual({ ptoDays: 20, health: "PPO", other: null });
  });
});

describe("journalInput", () => {
  it("validates kind and requires a title on create", () => {
    expect(journalInput({ kind: "rant" }).error).toMatch(/kind/);
    expect(journalInput({ kind: "achievement" }, { create: true }).error).toMatch(/title/);
    expect(journalInput({ title: "Won", body: undefined, technologies: ["TS"] }, { create: true }).values).toEqual({
      title: "Won",
      technologies: '["TS"]',
    });
  });
});
