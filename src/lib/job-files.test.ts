import { describe, it, expect } from "vitest";
import { DOCX_MIME, JOB_FILE_MAX_BYTES, PDF_MIME, contentDisposition, validateJobUpload } from "./job-files";

describe("validateJobUpload", () => {
  it.each([
    [{ kind: "offer_letter", mimeType: PDF_MIME, size: 10 }, null],
    [{ kind: "handbook", mimeType: DOCX_MIME, size: JOB_FILE_MAX_BYTES }, null],
    [{ kind: "contract", mimeType: "text/plain", size: 10 }, "Only PDF or DOCX files are supported"],
    [{ kind: "payslip", mimeType: PDF_MIME, size: 10 }, "kind must be one of offer_letter, handbook, contract, review, misc"],
    [{ kind: "misc", mimeType: PDF_MIME, size: JOB_FILE_MAX_BYTES + 1 }, "File exceeds the 10MB limit"],
    [{ kind: "misc", mimeType: PDF_MIME, size: 0 }, "File is empty"],
  ])("%o → %s", (input, error) => {
    expect(validateJobUpload(input)).toBe(error);
  });
});

describe("contentDisposition", () => {
  it("quotes a safe ASCII fallback and adds a UTF-8 filename*", () => {
    expect(contentDisposition("offer.pdf", false)).toBe(`attachment; filename="offer.pdf"; filename*=UTF-8''offer.pdf`);
    expect(contentDisposition('a"b\r\n.pdf', true)).toBe(`inline; filename="a_b__.pdf"; filename*=UTF-8''a%22b%0D%0A.pdf`);
    expect(contentDisposition("Café offer.pdf", false)).toBe(`attachment; filename="Caf_ offer.pdf"; filename*=UTF-8''Caf%C3%A9%20offer.pdf`);
  });
});
