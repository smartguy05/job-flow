import { describe, it, expect } from "vitest";
import { inventionInput, exhibitText, resumeInventionsSection, normalizeTitle } from "./inventions";

const entry = (over: Record<string, unknown> = {}) => ({
  title: "Rate limiter",
  description: "A token-bucket rate limiting library.",
  inventionDate: "2019",
  identifier: "https://github.com/me/limiter",
  technologies: '["Go"]',
  includeInResume: false,
  ...over,
});

describe("inventionInput", () => {
  it("parses fields, booleans, kinds and technologies", () => {
    const r = inventionInput(
      { title: " Limiter ", description: "", kind: "software", includeInResume: "true", technologies: "Go, go", junk: 1 },
      { create: true },
    );
    expect(r.error).toBeUndefined();
    expect(r.values).toEqual({ title: "Limiter", description: "", kind: "software", includeInResume: true, technologies: '["Go"]' });
  });
  it("rejects missing titles, bad kinds and bad booleans", () => {
    expect(inventionInput({}, { create: true }).error).toMatch(/title/);
    expect(inventionInput({ kind: "magic" }).error).toMatch(/kind/);
    expect(inventionInput({ includeInResume: "maybe" }).error).toMatch(/includeInResume/);
  });
});

describe("exhibitText", () => {
  it("renders a numbered list with a signature block", () => {
    const t = exhibitText([entry(), entry({ title: "Parser", inventionDate: null, identifier: null, description: "" })], "Pat Doe");
    expect(t).toContain("EXHIBIT A");
    expect(t).toContain("LIST OF PRIOR INVENTIONS AND ORIGINAL WORKS OF AUTHORSHIP");
    expect(t).toContain("1. Rate limiter (2019)");
    expect(t).toContain("   Identifying number: https://github.com/me/limiter");
    expect(t).toContain("   A token-bucket rate limiting library.");
    expect(t).toContain("2. Parser\n");
    expect(t).toContain("Name: Pat Doe");
    expect(t).toMatch(/Signature: _+/);
  });
  it("says none when empty", () => {
    expect(exhibitText([], null)).toContain("No prior inventions");
  });
});

describe("resumeInventionsSection", () => {
  it("includes only opted-in entries", () => {
    const s = resumeInventionsSection([entry({ includeInResume: true }), entry({ title: "Secret", includeInResume: false })]);
    expect(s).toContain("# Personal projects & inventions");
    expect(s).toContain("## Rate limiter (2019)");
    expect(s).toContain("Technologies: Go");
    expect(s).toContain("Link: https://github.com/me/limiter");
    expect(s).not.toContain("Secret");
  });
  it("is empty when nothing is opted in", () => {
    expect(resumeInventionsSection([entry()])).toBe("");
  });
});

describe("normalizeTitle", () => {
  it("ignores case and punctuation", () => {
    expect(normalizeTitle("Rate-Limiter v2!")).toBe(normalizeTitle("rate limiter V2"));
  });
});
