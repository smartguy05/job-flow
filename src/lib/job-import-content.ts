import { z } from "zod";

// Shape of past jobs the LLM extracts from an existing career profile (backfill import).

// Accept YYYY-MM-DD, YYYY-MM or YYYY; anything else (blank, "present", prose) → null.
export function normalizeDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  return null;
}

const dateField = z.preprocess(normalizeDate, z.string().nullable());

export const ImportedJobSchema = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  startDate: dateField,
  endDate: dateField,
  technologies: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
});

export const ImportedJobsSchema = z.object({ jobs: z.array(ImportedJobSchema).default([]) });

export type ImportedJob = z.infer<typeof ImportedJobSchema>;
