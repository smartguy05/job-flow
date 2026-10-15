import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildBragDoc, bragDocDocx, bragDocMarkdown, type BragDocInput } from "./brag-doc";

const entry = (over: Record<string, unknown>) => ({
  kind: "achievement",
  title: "Shipped search",
  body: "Rebuilt indexing",
  impact: "p95 -40%",
  technologies: '["Elasticsearch"]',
  entryDate: "2026-03-01",
  ...over,
});

function input(over: Partial<BragDocInput> = {}): BragDocInput {
  return {
    job: { company: "Globex", title: "Staff Engineer", technologies: '["Go"]' },
    entries: [
      entry({}),
      entry({ title: "Old win", entryDate: "2025-01-01", impact: null }),
      entry({ kind: "feedback", title: "Great mentor", body: "from Sam", impact: null, technologies: "[]", entryDate: "2026-04-01" }),
      entry({ kind: "complaint", title: "Boss micromanages", body: "SECRET-COMPLAINT", entryDate: "2026-04-02" }),
      entry({ kind: "note", title: "Salary talk", body: "SECRET-NOTE $150k", entryDate: "2026-04-03" }),
    ],
    goals: [
      { title: "Launch v2", description: "New API", period: "2026-H1", status: "done", progress: 100, keyResults: '[{"text":"GA by June","done":true}]' },
      { title: "Mentor two juniors", description: null, period: "2026-H2", status: "active", progress: 50, keyResults: "[]" },
      { title: "Dropped goal", description: null, period: null, status: "dropped", progress: 10, keyResults: "[]" },
    ],
    reviews: [
      {
        cycle: "2026 mid-year",
        periodStart: "2026-01-01",
        periodEnd: "2026-06-30",
        rating: "Exceeds",
        reviewer: "Pat",
        summary: "Strong half",
        strengths: "Ownership",
        growthAreas: "Delegation",
        outcome: "SECRET-OUTCOME promoted +12%",
      },
      { cycle: "2024 annual", periodStart: "2024-01-01", periodEnd: "2024-12-31", rating: null, reviewer: null, summary: "Old review", strengths: null, growthAreas: null, outcome: null },
    ],
    ...over,
  };
}

describe("buildBragDoc", () => {
  it("collects achievements, feedback, goals and technologies within the range", () => {
    const doc = buildBragDoc({ ...input(), from: "2026-01-01", to: "2026-12-31" });
    expect(doc.achievements.map((a) => a.title)).toEqual(["Shipped search"]);
    expect(doc.achievements[0]).toMatchObject({ impact: "p95 -40%", date: "2026-03-01" });
    expect(doc.feedback.map((f) => f.title)).toEqual(["2026 mid-year review (Pat)", "Great mentor"]);
    expect(doc.feedback[0].detail).toContain("Ownership");
    expect(doc.feedback[0].detail).toContain("Delegation");
    expect(doc.goalsCompleted.map((g) => g.title)).toEqual(["Launch v2"]);
    expect(doc.goalsCompleted[0].keyResults).toEqual(["GA by June"]);
    expect(doc.goalsInProgress).toEqual([{ title: "Mentor two juniors", period: "2026-H2", progress: 50 }]);
    expect(doc.technologies).toEqual(["Go", "Elasticsearch"]);
  });

  it("includes everything when no range is given", () => {
    const doc = buildBragDoc(input());
    expect(doc.achievements.map((a) => a.title)).toEqual(["Shipped search", "Old win"]);
    expect(doc.feedback.map((f) => f.title)).toContain("2024 annual review");
  });

  it("never includes complaints, private notes or review outcomes", () => {
    const doc = buildBragDoc(input());
    const md = bragDocMarkdown(doc);
    const json = JSON.stringify(doc);
    for (const secret of ["SECRET-COMPLAINT", "SECRET-NOTE", "micromanages", "Salary talk", "$150k", "SECRET-OUTCOME"]) {
      expect(md).not.toContain(secret);
      expect(json).not.toContain(secret);
    }
  });
});

describe("bragDocMarkdown", () => {
  it("renders headed sections", () => {
    const md = bragDocMarkdown(buildBragDoc({ ...input(), from: "2026-01-01", to: "2026-12-31" }));
    expect(md).toContain("# Brag doc — Staff Engineer at Globex");
    expect(md).toContain("2026-01-01 – 2026-12-31");
    expect(md).toContain("## Achievements");
    expect(md).toContain("- **Shipped search** (2026-03-01) — Rebuilt indexing. Impact: p95 -40%");
    expect(md).toContain("## Feedback received");
    expect(md).toContain("## Goals completed");
    expect(md).toContain("## Goals in progress");
    expect(md).toContain("Mentor two juniors (2026-H2) — 50%");
    expect(md).toContain("## Technologies");
  });

  it("says so when a section is empty", () => {
    const md = bragDocMarkdown(buildBragDoc({ job: { company: "A", title: "B", technologies: "[]" }, entries: [], goals: [], reviews: [] }));
    expect(md).toContain("_Nothing recorded._");
  });
});

describe("bragDocDocx", () => {
  it("produces a DOCX containing the content", async () => {
    const buf = await bragDocDocx(buildBragDoc(input()));
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Shipped search");
    expect(xml).toContain("Feedback received");
    expect(xml).not.toContain("SECRET");
  });
});
