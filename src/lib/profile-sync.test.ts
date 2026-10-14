import { describe, it, expect } from "vitest";
import { buildSyncInstruction } from "./profile-sync";

const job = {
  id: 1,
  company: "Globex",
  title: "Engineer",
  startDate: "2024-01-01",
  endDate: null,
  team: "Platform",
  technologies: '["Go","Postgres"]',
};
const entry = (over: Record<string, unknown>) => ({
  id: 10,
  jobId: 1,
  kind: "achievement",
  title: "Shipped search",
  body: "Rebuilt search indexing",
  impact: "p95 -40%",
  technologies: '["Elasticsearch"]',
  entryDate: "2024-06-01",
  ...over,
});

describe("buildSyncInstruction", () => {
  it("includes job facts, titles, technologies, achievements and feedback", () => {
    const r = buildSyncInstruction(
      [{ ...job, titles: ["Engineer", "Senior Engineer"] }],
      [entry({}), entry({ id: 11, kind: "feedback", title: "Great mentor", impact: null, technologies: "[]" })],
    );
    expect(r.entryIds).toEqual([10, 11]);
    expect(r.instruction).toContain("Globex");
    expect(r.instruction).toContain("2024-01-01 – present");
    expect(r.instruction).toContain("Senior Engineer");
    expect(r.instruction).toContain("Go, Postgres, Elasticsearch");
    expect(r.instruction).toContain("Shipped search");
    expect(r.instruction).toContain("p95 -40%");
    expect(r.instruction).toContain("Great mentor");
    expect(r.instruction).toMatch(/do not invent/i);
  });

  it("never leaks complaints, private notes or compensation", () => {
    const r = buildSyncInstruction(
      [job],
      [
        entry({ id: 12, kind: "complaint", title: "Boss micromanages", body: "ugh" }),
        entry({ id: 13, kind: "note", title: "Salary talk", body: "$150k" }),
      ],
    );
    expect(r.entryIds).toEqual([]);
    expect(r.instruction).not.toContain("micromanages");
    expect(r.instruction).not.toContain("Salary talk");
    expect(r.instruction).not.toContain("$150k");
  });

  it("ignores entries for jobs not in the list", () => {
    const r = buildSyncInstruction([job], [entry({ id: 14, jobId: 99 })]);
    expect(r.entryIds).toEqual([]);
  });
});
