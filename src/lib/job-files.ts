// Documents kept against a held job (offer letter, handbook, contract, review, misc).
// Store-and-download only: these bytes are never read for text and never sent to an LLM.
// Pure helpers (client-safe); the DB side is src/lib/services/job-files.ts.

export const JOB_FILE_KINDS = ["offer_letter", "handbook", "contract", "review", "misc"] as const;
export type JobFileKind = (typeof JOB_FILE_KINDS)[number];

export const PDF_MIME = "application/pdf";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const JOB_FILE_MIME_TYPES = [PDF_MIME, DOCX_MIME] as const;
export const JOB_FILE_MAX_BYTES = 10 * 1024 * 1024; // same cap as application files

// null when the upload is acceptable, else the error to show.
export function validateJobUpload(f: { kind: string; mimeType: string; size: number }): string | null {
  if (!(JOB_FILE_KINDS as readonly string[]).includes(f.kind)) return `kind must be one of ${JOB_FILE_KINDS.join(", ")}`;
  if (!(JOB_FILE_MIME_TYPES as readonly string[]).includes(f.mimeType)) return "Only PDF or DOCX files are supported";
  if (f.size <= 0) return "File is empty";
  if (f.size > JOB_FILE_MAX_BYTES) return "File exceeds the 10MB limit";
  return null;
}

// Content-Disposition with a sanitized ASCII fallback (no quotes, backslashes or control
// characters, so a stored name can't break out of the header) plus an RFC 5987 UTF-8 name.
export function contentDisposition(name: string, inline: boolean): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const utf8 = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
