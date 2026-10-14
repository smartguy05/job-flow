import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildExhibitDocx, renderExhibit } from "./exhibit-docx";

const entries = [
  { title: "Rate limiter", description: "Token-bucket library.", inventionDate: "2019", identifier: "https://github.com/me/limiter" },
  { title: "Parser & lexer", description: "", inventionDate: null, identifier: null },
];

async function documentXml(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  return zip.file("word/document.xml")!.async("string");
}

describe("buildExhibitDocx", () => {
  it("renders the heading, a table row per entry and a signature block", async () => {
    const xml = await documentXml(await buildExhibitDocx(entries, "Pat Doe"));
    expect(xml).toContain("EXHIBIT A");
    expect(xml).toContain("LIST OF PRIOR INVENTIONS AND ORIGINAL WORKS OF AUTHORSHIP");
    expect(xml).toContain("Identifying number or brief description");
    expect(xml).toContain("Rate limiter");
    expect(xml).toContain("https://github.com/me/limiter");
    expect(xml).toContain("Token-bucket library.");
    expect(xml).toContain("Parser &amp; lexer");
    expect(xml).toContain("Pat Doe");
    expect(xml).toContain("Signature");
    expect((xml.match(/<w:tr>|<w:tr /g) ?? []).length).toBe(3); // header + 2 rows
  });

  it("states there is nothing to disclose when empty", async () => {
    const xml = await documentXml(await buildExhibitDocx([], null));
    expect(xml).toContain("No prior inventions");
    expect(xml).not.toContain("<w:tbl>");
  });
});

// Real conversion through LibreOffice (same requirement as the renderResume integration test).
describe("renderExhibit (integration)", () => {
  it("returns docx and pdf bytes", async () => {
    const { docx, pdf } = await renderExhibit(entries, "Pat Doe");
    expect(docx.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  }, 90000);
});
