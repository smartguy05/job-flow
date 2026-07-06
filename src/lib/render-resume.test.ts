import { describe, it, expect } from "vitest";
import { Packer } from "docx";
import { buildDocx, renderResume, getPdfPageCount } from "./render-resume";
import { makeResumeContent } from "@/test/fixtures";

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

// Real end-to-end render through LibreOffice + poppler. Slower; requires soffice/pdfinfo.
describe("renderResume (integration)", () => {
  it("returns docx + pdf buffers and reports a positive page count", async () => {
    const { docx, pdf, pageCount } = await renderResume(makeResumeContent(), "TestResume");
    expect(Buffer.isBuffer(docx)).toBe(true);
    expect(docx.length).toBeGreaterThan(0);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pageCount).toBeGreaterThanOrEqual(1);
  });
});
