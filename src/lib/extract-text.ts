import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileP = promisify(execFile);

// Files whose bytes are already text — decoded directly as UTF-8.
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".text", ".csv", ".log"]);
// Office documents LibreOffice can convert to plain text.
const OFFICE_EXTENSIONS = new Set([".docx", ".doc", ".odt", ".rtf"]);

// The file types the job-description upload accepts — shared with the client `accept` list.
export const JD_UPLOAD_ACCEPT = ".txt,.md,.pdf,.doc,.docx,.odt,.rtf";

export class UnsupportedFileTypeError extends Error {
  constructor(detail: string) {
    super(`Unsupported job description file type (${detail}). Upload a PDF, Word, or text file.`);
    this.name = "UnsupportedFileTypeError";
  }
}

function extOf(name: string): string {
  return path.extname(name || "").toLowerCase();
}

function isTextType(mimeType: string, ext: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/csv" ||
    TEXT_EXTENSIONS.has(ext)
  );
}

function isPdf(mimeType: string, ext: string): boolean {
  return mimeType === "application/pdf" || ext === ".pdf";
}

function isOffice(mimeType: string, ext: string): boolean {
  return (
    OFFICE_EXTENSIONS.has(ext) ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword" ||
    mimeType === "application/vnd.oasis.opendocument.text" ||
    mimeType === "application/rtf"
  );
}

// Normalize extracted text: unify newlines, drop trailing spaces, collapse blank-line runs.
export function tidyText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Extract plain text from an uploaded job-description file. Text files are decoded directly;
// PDFs go through poppler `pdftotext`; Office documents through LibreOffice `soffice`. Throws
// UnsupportedFileTypeError for anything we can't turn into text.
export async function extractJobDescriptionText(
  bytes: Buffer,
  opts: { name?: string; mimeType?: string } = {},
): Promise<string> {
  const mimeType = opts.mimeType ?? "";
  const ext = extOf(opts.name ?? "");

  if (isTextType(mimeType, ext)) return tidyText(bytes.toString("utf8"));
  if (isPdf(mimeType, ext)) return tidyText(await extractPdf(bytes));
  if (isOffice(mimeType, ext)) return tidyText(await extractOffice(bytes, ext || ".docx"));

  throw new UnsupportedFileTypeError(mimeType || ext || "unknown");
}

async function extractPdf(bytes: Buffer): Promise<string> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "jd-pdf-"));
  try {
    const src = path.join(work, "jd.pdf");
    await fs.writeFile(src, bytes);
    // `-layout` keeps columns/spacing roughly intact; `-` writes the text to stdout.
    const { stdout } = await execFileP("pdftotext", ["-layout", src, "-"], { timeout: 30000 });
    return stdout;
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

async function extractOffice(bytes: Buffer, ext: string): Promise<string> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "jd-doc-"));
  // Private LO profile dir so concurrent conversions don't collide on the default lock.
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "jd-lo-"));
  try {
    const src = path.join(work, `jd${ext}`);
    await fs.writeFile(src, bytes);
    await execFileP(
      "soffice",
      [
        "--headless",
        `-env:UserInstallation=file://${profileDir}`,
        "--convert-to",
        "txt:Text",
        "--outdir",
        work,
        src,
      ],
      { timeout: 60000 },
    );
    return await fs.readFile(path.join(work, "jd.txt"), "utf8");
  } finally {
    await fs.rm(work, { recursive: true, force: true });
    await fs.rm(profileDir, { recursive: true, force: true });
  }
}
