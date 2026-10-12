import { describe, it, expect } from "vitest";
import {
  buildChecklist,
  normalizeQuestion,
  dedupeImports,
  type QuestionRow,
  type QuestionStateRow,
} from "./interview-questions";

const q = (id: number, sortOrder: number, applicationId: number | null = null): QuestionRow => ({
  id,
  text: `q${id}`,
  sortOrder,
  applicationId,
});
const st = (questionId: number, at: string | null, notes = ""): QuestionStateRow => ({
  questionId,
  checkedAt: at ? new Date(at) : null,
  notes,
});

describe("buildChecklist", () => {
  it("orders unchecked general then job, by sortOrder then id", () => {
    const out = buildChecklist([q(2, 1), q(1, 1), q(3, 0)], [q(5, 0, 9), q(4, 0, 9)], []);
    expect(out.map((i) => i.id)).toEqual([3, 1, 2, 4, 5]);
    expect(out.map((i) => i.source)).toEqual(["general", "general", "general", "job", "job"]);
    expect(out[0]).toMatchObject({ checked: false, checkedAt: null, notes: "" });
  });
  it("puts checked last ordered by checkedAt asc, ties by id", () => {
    const out = buildChecklist(
      [q(1, 0), q(2, 0), q(3, 0)],
      [q(4, 0, 9)],
      [
        st(1, "2026-01-03T00:00:00.000Z", "a"),
        st(4, "2026-01-02T00:00:00.000Z"),
        st(3, "2026-01-03T00:00:00.000Z"),
      ],
    );
    expect(out.map((i) => i.id)).toEqual([2, 4, 1, 3]);
    expect(out[2]).toMatchObject({ checked: true, checkedAt: "2026-01-03T00:00:00.000Z", notes: "a" });
  });
  it("keeps notes on unchecked items", () => {
    const out = buildChecklist([q(1, 0)], [], [st(1, null, "hi")]);
    expect(out[0]).toMatchObject({ checked: false, notes: "hi" });
  });
});

describe("normalizeQuestion", () => {
  it("trims and rejects bad input", () => {
    expect(normalizeQuestion("  hi  ")).toBe("hi");
    expect(normalizeQuestion("   ")).toBeNull();
    expect(normalizeQuestion(5)).toBeNull();
    expect(normalizeQuestion(undefined)).toBeNull();
    expect(normalizeQuestion("a".repeat(1000))).toBe("a".repeat(1000));
    expect(normalizeQuestion("a".repeat(1001))).toBeNull();
  });
});

describe("dedupeImports", () => {
  it("drops blanks and case/trim duplicates, preserving order", () => {
    expect(dedupeImports([" Why? "], ["why?", "How?", " how? ", "", "  ", "What?"])).toEqual([
      "How?",
      "What?",
    ]);
  });
});
