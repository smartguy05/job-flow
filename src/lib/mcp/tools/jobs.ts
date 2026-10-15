import { z } from "zod";
import { JOURNAL_KINDS } from "@/lib/jobs";
import { listJobs } from "@/lib/services/jobs";
import { addJournalEntry, listJournal } from "@/lib/services/journal";
import { defineTool, READ_ONLY, WRITES } from "../tool";

const jobId = z.number().int().positive();
const date = z.string().describe("YYYY-MM-DD");

export const listJobsTool = defineTool({
  name: "list_jobs",
  title: "List jobs",
  description: "The user's employment history (current job first), with tenure in months and technologies.",
  inputSchema: z.object({}),
  annotations: READ_ONLY,
  async handler(userId) {
    return listJobs(userId);
  },
});

export const addJournalEntryTool = defineTool({
  name: "add_journal_entry",
  title: "Add a work-journal entry",
  description:
    "Record an achievement, feedback, complaint or note against one of the user's jobs (see list_jobs). " +
    "Achievements with concrete impact feed resume generation after a profile sync.",
  inputSchema: z.object({
    jobId,
    title: z.string().describe("One-line summary"),
    body: z.string().optional().describe("Details"),
    kind: z.enum(JOURNAL_KINDS).optional().describe("Defaults to achievement"),
    impact: z.string().optional().describe("Measurable outcome, e.g. 'cut p99 latency 40%'"),
    entryDate: date.optional().describe("YYYY-MM-DD; defaults to today"),
    technologies: z.array(z.string()).optional(),
  }),
  annotations: WRITES,
  async handler(userId, { jobId: job, ...body }) {
    return addJournalEntry(userId, job, body);
  },
});

export const listJournalTool = defineTool({
  name: "list_journal",
  title: "List work-journal entries",
  description: "Work-journal entries, newest first, across all jobs or one job, optionally by kind and date range.",
  inputSchema: z.object({
    jobId: jobId.optional(),
    kind: z.enum(JOURNAL_KINDS).optional(),
    from: date.optional().describe("Inclusive start date, YYYY-MM-DD"),
    to: date.optional().describe("Inclusive end date, YYYY-MM-DD"),
  }),
  annotations: READ_ONLY,
  async handler(userId, args) {
    return listJournal(userId, args);
  },
});
