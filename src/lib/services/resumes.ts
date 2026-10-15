import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { NotFoundError } from "./errors";

export type ResumeFormat = "pdf" | "docx";

const CONTENT_TYPES: Record<ResumeFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// The stored bytes of one of the user's resumes in the requested format, with a download
// filename and content type. NotFoundError when the resume isn't the user's or the format
// hasn't been rendered.
export async function getResumeFile(userId: string, resumeId: number, fmt: ResumeFormat) {
  const [r] = await db
    .select({
      version: schema.resumes.version,
      baseName: schema.resumes.baseName,
      docxData: schema.resumes.docxData,
      pdfData: schema.resumes.pdfData,
    })
    .from(schema.resumes)
    .where(and(eq(schema.resumes.id, resumeId), eq(schema.resumes.userId, userId)))
    .limit(1);
  if (!r) throw new NotFoundError();

  const data = fmt === "docx" ? r.docxData : r.pdfData;
  if (!data) throw new NotFoundError(`No ${fmt} available`);

  return {
    data: new Uint8Array(data),
    filename: `${r.baseName ?? `resume_v${r.version}`}.${fmt}`,
    contentType: CONTENT_TYPES[fmt],
  };
}

// Metadata for one of the user's resumes — never the DOCX/PDF bytes.
export async function getResumeSummary(userId: string, resumeId: number) {
  const [r] = await db
    .select({
      id: schema.resumes.id,
      applicationId: schema.resumes.applicationId,
      version: schema.resumes.version,
      status: schema.resumes.status,
      pageCount: schema.resumes.pageCount,
      fitWarning: schema.resumes.fitWarning,
      docx: schema.resumes.docxData,
      pdf: schema.resumes.pdfData,
    })
    .from(schema.resumes)
    .where(and(eq(schema.resumes.id, resumeId), eq(schema.resumes.userId, userId)))
    .limit(1);
  if (!r) throw new NotFoundError();
  const { docx, pdf, ...meta } = r;
  return { ...meta, hasPdf: !!pdf, hasDocx: !!docx };
}
