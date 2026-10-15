import { describe, it, expect } from "vitest";
import {
  checklistField,
  currentManager,
  goalInput,
  managerHistory,
  oneOnOneInput,
  parseChecklist,
  personInput,
  reviewInput,
} from "./career-growth";

describe("parseChecklist / checklistField", () => {
  it("reads stored JSON leniently", () => {
    expect(parseChecklist('[{"text":"a","done":true},{"text":"b"}]')).toEqual([
      { text: "a", done: true },
      { text: "b", done: false },
    ]);
    expect(parseChecklist("not json")).toEqual([]);
    expect(parseChecklist('{"x":1}')).toEqual([]);
    expect(parseChecklist(null)).toEqual([]);
    expect(parseChecklist('[1, {"text":""}, {"text":" c "}]')).toEqual([{ text: "c", done: false }]);
  });

  it("normalizes request input from objects, strings or newline text", () => {
    expect(checklistField([{ text: "ship", done: true }, "write docs", { nope: 1 }])).toBe(
      JSON.stringify([
        { text: "ship", done: true },
        { text: "write docs", done: false },
      ]),
    );
    expect(checklistField("one\n\n two ")).toBe(JSON.stringify([{ text: "one", done: false }, { text: "two", done: false }]));
    expect(checklistField(undefined)).toBeUndefined();
    expect(checklistField(null)).toBe("[]");
  });
});

describe("input parsers", () => {
  it("personInput requires a name and a known relationship", () => {
    expect(personInput({}, { create: true }).error).toMatch(/name/);
    expect(personInput({ name: "Ann", relationship: "boss" }, { create: true }).error).toMatch(/relationship/);
    expect(personInput({ name: "Ann", startDate: "May" }, { create: true }).error).toMatch(/YYYY-MM-DD/);
    expect(personInput({ name: "Ann", relationship: "manager", startDate: "2025-01-01" }, { create: true })).toEqual({
      values: { name: "Ann", relationship: "manager", startDate: "2025-01-01" },
    });
    // PATCH may omit name
    expect(personInput({ title: "VP" }).values).toEqual({ title: "VP" });
  });

  it("oneOnOneInput parses person, notes and action items", () => {
    const r = oneOnOneInput({ date: "2026-05-01", personId: "3", notes: "talked", actionItems: ["follow up"] });
    expect(r.error).toBeUndefined();
    expect(r.values).toEqual({
      date: "2026-05-01",
      personId: 3,
      notes: "talked",
      actionItems: JSON.stringify([{ text: "follow up", done: false }]),
    });
    expect(oneOnOneInput({ personId: "x" }).error).toMatch(/personId/);
    expect(oneOnOneInput({ notes: 5 }).values.notes).toBe("");
  });

  it("reviewInput requires a cycle and validates dates and compensationId", () => {
    expect(reviewInput({}, { create: true }).error).toMatch(/cycle/);
    expect(reviewInput({ cycle: "H1", periodEnd: "June" }, { create: true }).error).toMatch(/YYYY-MM-DD/);
    expect(reviewInput({ cycle: "H1", compensationId: "abc" }, { create: true }).error).toMatch(/compensationId/);
    const ok = reviewInput({ cycle: "2026 H1", rating: "Exceeds", strengths: "Ownership", compensationId: 4 }, { create: true });
    expect(ok.values).toEqual({ cycle: "2026 H1", rating: "Exceeds", strengths: "Ownership", compensationId: 4 });
  });

  it("goalInput validates status and progress range, and done implies 100%", () => {
    expect(goalInput({}, { create: true }).error).toMatch(/title/);
    expect(goalInput({ status: "paused" }).error).toMatch(/status/);
    expect(goalInput({ progress: 120 }).error).toMatch(/progress/);
    expect(goalInput({ progress: -1 }).error).toMatch(/progress/);
    expect(goalInput({ status: "done" }).values).toEqual({ status: "done", progress: 100 });
    expect(goalInput({ status: "done", progress: 80 }).values).toEqual({ status: "done", progress: 80 });
    expect(goalInput({ title: "Ship v2", keyResults: ["p95 < 200ms"], period: "2026-H2" }, { create: true }).values).toEqual({
      title: "Ship v2",
      period: "2026-H2",
      keyResults: JSON.stringify([{ text: "p95 < 200ms", done: false }]),
    });
  });
});

describe("manager history", () => {
  const p = (id: number, over: Record<string, unknown>) => ({
    id,
    name: `P${id}`,
    relationship: "manager",
    title: null,
    startDate: null as string | null,
    endDate: null as string | null,
    ...over,
  });
  const people = [
    p(1, { name: "Old Boss", startDate: "2022-01-01", endDate: "2023-06-30" }),
    p(2, { name: "Current Boss", startDate: "2023-07-01" }),
    p(3, { name: "A Peer", relationship: "peer", startDate: "2024-01-01" }),
    p(4, { name: "Future Boss", startDate: "2099-01-01" }),
  ];

  it("lists manager rows in date order", () => {
    expect(managerHistory(people).map((m) => m.name)).toEqual(["Old Boss", "Current Boss", "Future Boss"]);
  });

  it("derives the current manager from date ranges, falling back to jobs.manager", () => {
    expect(currentManager(people, "Legacy Name", "2025-01-01")).toBe("Current Boss");
    expect(currentManager(people, "Legacy Name", "2023-01-01")).toBe("Old Boss");
    expect(currentManager([p(3, { relationship: "peer" })], "Legacy Name", "2025-01-01")).toBe("Legacy Name");
    expect(currentManager([], null, "2025-01-01")).toBeNull();
    // an undated manager row counts as current
    expect(currentManager([p(5, { name: "Undated" })], null, "2025-01-01")).toBe("Undated");
  });
});
