import { describe, it, expect } from "vitest";
import {
  formatAmount,
  formatTenure,
  COMP_KIND_LABELS,
  JOURNAL_KIND_LABELS,
  PERSON_RELATIONSHIP_LABELS,
  GOAL_STATUS_LABELS,
  jobTabFromHash,
  checklistToText,
  textToChecklist,
} from "./job-labels";
import { GOAL_STATUSES, PERSON_RELATIONSHIPS } from "./career-growth";

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
  it("labels every relationship and goal status", () => {
    for (const r of PERSON_RELATIONSHIPS) expect(PERSON_RELATIONSHIP_LABELS[r]).toBeTruthy();
    for (const g of GOAL_STATUSES) expect(GOAL_STATUS_LABELS[g]).toBeTruthy();
  });
  it("maps a URL hash to a known tab", () => {
    expect(jobTabFromHash("#people")).toBe("people");
    expect(jobTabFromHash("reviews")).toBe("reviews");
    expect(jobTabFromHash("#nope")).toBe("overview");
    expect(jobTabFromHash("")).toBe("overview");
  });
  it("round-trips checklists through textarea text", () => {
    const items = [
      { text: "Write packet", done: true },
      { text: "Ask for feedback", done: false },
    ];
    expect(checklistToText(items)).toBe("[x] Write packet\nAsk for feedback");
    expect(textToChecklist("[x] Write packet\n\n  Ask for feedback  \n[X]Done")).toEqual([...items, { text: "Done", done: true }]);
  });
});
