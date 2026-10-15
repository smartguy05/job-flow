import { z } from "zod";
import { GOAL_STATUSES } from "@/lib/career-growth";
import { createItem, getBragDoc, updateItem } from "@/lib/services/career-growth";
import { ValidationError } from "@/lib/services/errors";
import { defineTool, READ_ONLY, WRITES } from "../tool";

const jobId = z.number().int().positive().describe("Job id (see list_jobs)");
const date = z.string().describe("YYYY-MM-DD");
const checklist = z
  .array(z.union([z.string(), z.object({ text: z.string(), done: z.boolean().optional() })]))
  .describe("Items as strings or { text, done }");

export const logOneOnOneTool = defineTool({
  name: "log_one_on_one",
  title: "Log a 1:1",
  description:
    "Record a 1:1 meeting for one of the user's jobs, with private notes and action items. " +
    "personId optionally links a person tracked on that job.",
  inputSchema: z.object({
    jobId,
    date: date.optional().describe("YYYY-MM-DD; defaults to today"),
    personId: z.number().int().positive().optional(),
    notes: z.string().optional(),
    actionItems: checklist.optional(),
  }),
  annotations: WRITES,
  async handler(userId, { jobId: job, ...body }) {
    return createItem("oneOnOnes", userId, job, body);
  },
});

export const addReviewTool = defineTool({
  name: "add_review",
  title: "Add a performance review",
  description: "Record a performance review received at one of the user's jobs.",
  inputSchema: z.object({
    jobId,
    cycle: z.string().describe("e.g. '2026 mid-year'"),
    periodStart: date.optional(),
    periodEnd: date.optional(),
    rating: z.string().optional(),
    reviewer: z.string().optional(),
    summary: z.string().optional(),
    strengths: z.string().optional(),
    growthAreas: z.string().optional(),
    outcome: z.string().optional().describe("Private, e.g. promotion or raise; never used in drafts"),
  }),
  annotations: WRITES,
  async handler(userId, { jobId: job, ...body }) {
    return createItem("reviews", userId, job, body);
  },
});

export const updateGoalTool = defineTool({
  name: "update_goal",
  title: "Create or update a goal",
  description:
    "Update a goal's progress, status or key results (pass goalId), or create a new goal for a job " +
    "(omit goalId; title required). Marking a goal done sets progress to 100 unless given.",
  inputSchema: z.object({
    jobId,
    goalId: z.number().int().positive().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    period: z.string().optional().describe("e.g. 2026-H2"),
    status: z.enum(GOAL_STATUSES).optional(),
    progress: z.number().int().min(0).max(100).optional(),
    keyResults: checklist.optional(),
  }),
  annotations: WRITES,
  async handler(userId, { jobId: job, goalId, ...body }) {
    if (goalId === undefined) {
      if (!body.title) throw new ValidationError("title required to create a goal");
      return createItem("goals", userId, job, body);
    }
    await updateItem("goals", userId, job, goalId, body);
    return { id: goalId };
  },
});

export const getBragDocTool = defineTool({
  name: "get_brag_doc",
  title: "Get brag doc",
  description:
    "The user's brag doc for a job — achievements with impact, feedback received, goals and technologies — " +
    "as markdown plus structured sections. Optional inclusive date range. Complaints, private notes, 1:1s and pay are never included.",
  inputSchema: z.object({
    jobId,
    from: date.optional(),
    to: date.optional(),
  }),
  annotations: READ_ONLY,
  async handler(userId, { jobId: job, from, to }) {
    return getBragDoc(userId, job, { from, to });
  },
});
