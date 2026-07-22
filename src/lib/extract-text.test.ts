import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeFileSync } from "node:fs";
import path from "node:path";

// Mock the child_process boundary so pdf/office extraction is deterministic and doesn't
// depend on poppler/LibreOffice being installed. promisify(execFile) then resolves with the
// object our mock passes to the callback.
vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

import { execFile } from "node:child_process";
import { extractJobDescriptionText, tidyText, UnsupportedFileTypeError } from "./extract-text";

const mockExecFile = vi.mocked(execFile);

type ExecCb = (err: Error | null, out: { stdout: string; stderr: string }) => void;

beforeEach(() => {
  mockExecFile.mockReset();
});

describe("tidyText", () => {
  it("normalizes newlines, trims, and collapses blank-line runs", () => {
    expect(tidyText("a  \r\n\r\n\r\n\r\nb   \r\n")).toBe("a\n\nb");
  });
});

describe("extractJobDescriptionText — text files", () => {
  it("decodes a .txt file directly", async () => {
    const out = await extractJobDescriptionText(Buffer.from("Senior Engineer\nRemote\n"), {
      name: "jd.txt",
      mimeType: "text/plain",
    });
    expect(out).toBe("Senior Engineer\nRemote");
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("treats markdown by extension even without a mime type", async () => {
    const out = await extractJobDescriptionText(Buffer.from("# Role\n\nDetails"), { name: "posting.md" });
    expect(out).toBe("# Role\n\nDetails");
  });
});

describe("extractJobDescriptionText — PDF", () => {
  it("shells out to pdftotext and returns its stdout", async () => {
    mockExecFile.mockImplementation(((_file: string, _args: string[], _opts: unknown, cb: ExecCb) => {
      cb(null, { stdout: "Extracted PDF job description.\n", stderr: "" });
    }) as never);

    const out = await extractJobDescriptionText(Buffer.from([1, 2, 3]), {
      name: "jd.pdf",
      mimeType: "application/pdf",
    });
    expect(out).toBe("Extracted PDF job description.");
    const [cmd, args] = mockExecFile.mock.calls[0];
    expect(cmd).toBe("pdftotext");
    expect(args).toContain("-layout");
  });
});

describe("extractJobDescriptionText — Office docs", () => {
  it("converts via soffice and reads the produced txt", async () => {
    // Simulate soffice by writing the converted <outdir>/jd.txt the code then reads.
    mockExecFile.mockImplementation(((_file: string, args: string[], _opts: unknown, cb: ExecCb) => {
      const outDir = args[args.indexOf("--outdir") + 1];
      writeFileSync(path.join(outDir, "jd.txt"), "Converted DOCX text.");
      cb(null, { stdout: "", stderr: "" });
    }) as never);

    const out = await extractJobDescriptionText(Buffer.from([1, 2, 3]), {
      name: "jd.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(out).toBe("Converted DOCX text.");
    expect(mockExecFile.mock.calls[0][0]).toBe("soffice");
  });
});

describe("extractJobDescriptionText — unsupported", () => {
  it("throws UnsupportedFileTypeError for images", async () => {
    await expect(
      extractJobDescriptionText(Buffer.from([1]), { name: "logo.png", mimeType: "image/png" }),
    ).rejects.toBeInstanceOf(UnsupportedFileTypeError);
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});
