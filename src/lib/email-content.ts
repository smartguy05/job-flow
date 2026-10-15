import { z } from "zod";

// Shape of the LLM's classification of one job-search email (see classifyEmail in llm.ts).
// The email is untrusted input, so the schema is forgiving but tight: unknown kinds become
// "other", blank or non-string fields become null, dates must parse, and strings are capped.

export const EMAIL_KINDS = [
  "rejection",
  "interview_invite",
  "recruiter_reply",
  "offer",
  "application_ack",
  "other",
] as const;

export type EmailKind = (typeof EMAIL_KINDS)[number];

const optionalText = (max: number) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s ? s.slice(0, max) : null;
  }, z.string().nullable());

const isoDateTime = z.preprocess((v) => {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}, z.string().nullable());

export const EmailClassificationSchema = z.object({
  kind: z.preprocess(
    (v) => ((EMAIL_KINDS as readonly unknown[]).includes(v) ? v : "other"),
    z.enum(EMAIL_KINDS),
  ),
  company: optionalText(200),
  roleTitle: optionalText(200),
  interviewAt: isoDateTime,
  summary: z.preprocess((v) => (typeof v === "string" ? v.trim().slice(0, 500) : ""), z.string()),
  suggestedNextAction: optionalText(200),
});

export type EmailClassification = z.infer<typeof EmailClassificationSchema>;
