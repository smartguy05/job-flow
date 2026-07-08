import { describe, it, expect } from "vitest";
import { Packer } from "docx";
import { buildDocx, renderResume, getPdfPageCount, lastPageFillFromBbox } from "./render-resume";
import { makeResumeContent } from "@/test/fixtures";

// Minimal poppler `pdftotext -bbox` XHTML with the given pages. Each page is a list of
// word yMax values; page height is fixed at 792 (US Letter points).
function bbox(pages: number[][], height = 792): string {
  const body = pages
    .map((words) => {
      const wordTags = words
        .map((y) => `<word xMin="72" yMin="${y - 12}" xMax="120" yMax="${y}">x</word>`)
        .join("\n");
      return `<page width="612.0" height="${height}">\n${wordTags}\n</page>`;
    })
    .join("\n");
  return `<?xml version="1.0"?>\n<html><body><doc>\n${body}\n</doc></body></html>`;
}

describe("buildDocx", () => {
  it("produces a non-empty .docx buffer from valid content", async () => {
    const doc = buildDocx(makeResumeContent());
    const buf = await Packer.toBuffer(doc);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("does not throw when optional sections are empty", () => {
    expect(() => buildDocx(makeResumeContent({ earlyRoles: [], projects: [] }))).not.toThrow();
  });
});

describe("getPdfPageCount", () => {
  it("returns 0 for a nonexistent file", async () => {
    expect(await getPdfPageCount("/no/such/file.pdf")).toBe(0);
  });
});

describe("lastPageFillFromBbox", () => {
  it("returns a high ratio when the last page is nearly full", () => {
    // Last page content reaches y=760 of a 792pt page -> ~0.96.
    const xml = bbox([[700], [100, 400, 760]]);
    expect(lastPageFillFromBbox(xml)).toBeCloseTo(760 / 792, 2);
  });

  it("returns a low ratio when the last page is barely used", () => {
    // Second page holds a single line near the top.
    const xml = bbox([[100, 760], [90]]);
    expect(lastPageFillFromBbox(xml)).toBeCloseTo(90 / 792, 2);
    expect(lastPageFillFromBbox(xml)).toBeLessThan(0.7);
  });

  it("only measures the final page, ignoring earlier full pages", () => {
    const xml = bbox([[780], [200]]);
    expect(lastPageFillFromBbox(xml)).toBeCloseTo(200 / 792, 2);
  });

  it("returns 0 for an empty last page", () => {
    const xml = bbox([[780], []]);
    expect(lastPageFillFromBbox(xml)).toBe(0);
  });

  it("returns 0 when there are no pages", () => {
    expect(lastPageFillFromBbox("<html><body></body></html>")).toBe(0);
  });

  it("clamps to 1 when content overshoots the page height", () => {
    const xml = bbox([[900]]);
    expect(lastPageFillFromBbox(xml)).toBe(1);
  });
});

// Real end-to-end render through LibreOffice + poppler. Slower; requires soffice/pdfinfo.
describe("renderResume (integration)", () => {
  it("returns docx + pdf buffers and reports a positive page count", async () => {
    const { docx, pdf, pageCount, lastPageFill } = await renderResume(makeResumeContent(), "TestResume");
    expect(Buffer.isBuffer(docx)).toBe(true);
    expect(docx.length).toBeGreaterThan(0);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pageCount).toBeGreaterThanOrEqual(1);
    expect(lastPageFill).toBeGreaterThanOrEqual(0);
    expect(lastPageFill).toBeLessThanOrEqual(1);
  });
});
