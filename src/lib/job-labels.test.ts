import { describe, it, expect } from "vitest";
import { formatAmount, formatTenure, COMP_KIND_LABELS, JOURNAL_KIND_LABELS } from "./job-labels";

describe("job labels", () => {
  it("formats amounts by period", () => {
    expect(formatAmount(152500, "year", "USD")).toBe("$152,500/yr USD");
    expect(formatAmount(85, "hour", "EUR")).toBe("$85/hr EUR");
    expect(formatAmount(null, "year", "USD")).toBe("—");
  });
  it("formats tenure", () => {
    expect(formatTenure(null)).toBe("");
    expect(formatTenure(0)).toBe("<1 mo");
    expect(formatTenure(5)).toBe("5 mo");
    expect(formatTenure(12)).toBe("1 yr");
    expect(formatTenure(27)).toBe("2 yr 3 mo");
  });
  it("labels every kind", () => {
    expect(COMP_KIND_LABELS.bonus_payout).toBe("Bonus payout");
    expect(JOURNAL_KIND_LABELS.complaint).toBe("Complaint");
  });
});
