import { describe, it, expect } from "vitest";
import { detailFields } from "./application-fields";

describe("detailFields", () => {
  it("omits keys that are absent from the body", () => {
    expect(detailFields({ company: "X" })).toEqual({});
  });

  it("coerces numeric and date fields", () => {
    const out = detailFields({ payMin: "180000", interestRating: 5, nextActionDate: "2026-07-10" });
    expect(out.payMin).toBe(180000);
    expect(out.interestRating).toBe(5);
    expect(out.nextActionDate).toBeInstanceOf(Date);
  });

  it("passes text fields through, defaulting undefined-guarded to null", () => {
    const out = detailFields({ techStack: "Go, Postgres", location: null });
    expect(out.techStack).toBe("Go, Postgres");
    expect(out.location).toBeNull();
  });

  it("clears date and numeric fields when null is passed", () => {
    const out = detailFields({ nextActionDate: null, payMin: null });
    expect(out.nextActionDate).toBeNull();
    expect(out.payMin).toBeNull();
  });
});
