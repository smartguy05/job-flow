import { z } from "zod";
import { PTO_KINDS } from "@/lib/pto";
import { getEquitySummary, logPto } from "@/lib/services/career-growth";
import { defineTool, READ_ONLY, WRITES } from "../tool";

const date = z.string().describe("YYYY-MM-DD");

export const logPtoTool = defineTool({
  name: "log_pto",
  title: "Log PTO",
  description:
    "Record time off at one of the user's jobs. endDate defaults to startDate and days default to the " +
    "weekdays in the range (pass days for half days). Returns the entry and that year's PTO balance " +
    "against the job's allowance (vacation and other count against it; sick and holidays are tracked separately).",
  inputSchema: z.object({
    jobId: z.number().int().positive().describe("Job id (see list_jobs)"),
    startDate: date,
    endDate: date.optional(),
    days: z.number().min(0).optional(),
    kind: z.enum(PTO_KINDS).optional().describe("Defaults to vacation"),
    note: z.string().optional(),
  }),
  annotations: WRITES,
  async handler(userId, { jobId, ...body }) {
    return logPto(userId, jobId, body);
  },
});

export const getEquitySummaryTool = defineTool({
  name: "get_equity_summary",
  title: "Get equity summary",
  description:
    "Vested and unvested shares, the next vest and the full-vest date for each of the user's equity grants " +
    "(all jobs, or one with jobId), plus totals. asOf defaults to today. Grant notes are not included.",
  inputSchema: z.object({
    jobId: z.number().int().positive().optional(),
    asOf: date.optional(),
  }),
  annotations: READ_ONLY,
  async handler(userId, { jobId, asOf }) {
    return getEquitySummary(userId, { jobId, asOf });
  },
});
