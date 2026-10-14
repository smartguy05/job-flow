import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileP = promisify(execFile);

// Convert a .docx on disk to PDF in `outDir` with headless LibreOffice; returns the PDF path.
// Each call gets a private LO profile dir so concurrent conversions don't collide on the
// default profile lock.
export async function convertDocxFileToPdf(docxPath: string, outDir: string): Promise<string> {
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "lo-"));
  try {
    await execFileP(
      "soffice",
      ["--headless", `-env:UserInstallation=file://${profileDir}`, "--convert-to", "pdf", "--outdir", outDir, docxPath],
      { timeout: 60000 },
    );
    return path.join(outDir, `${path.basename(docxPath, ".docx")}.pdf`);
  } finally {
    await fs.rm(profileDir, { recursive: true, force: true });
  }
}

// Buffer-in, buffer-out variant for documents that only need the PDF bytes.
export async function docxToPdf(docx: Buffer, baseName = "document"): Promise<Buffer> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "docx-pdf-"));
  try {
    const docxPath = path.join(work, `${baseName}.docx`);
    await fs.writeFile(docxPath, docx);
    return await fs.readFile(await convertDocxFileToPdf(docxPath, work));
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}
