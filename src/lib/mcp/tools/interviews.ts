import { z } from "zod";
import { addInterview, updateInterview } from "@/lib/services/interviews";
import { defineTool, WRITES } from "../tool";

const fields = {
  scheduledAt: z.string().nullable().optional().describe("ISO date-time, e.g. 2026-11-02T15:00:00Z"),
  round: z.string().nullable().optional().describe('e.g. "Recruiter screen", "Onsite"'),
  interviewer: z.string().nullable().optional(),
  prepNotes: z.string().nullable().optional(),
};
const outcome = z.enum(["pending", "passed", "failed", "cancelled"]);

export const addInterviewTool = defineTool({
  name: "add_interview",
  title: "Add an interview",
  description: "Add an interview round to an application (logs an interview event on its timeline).",
  inputSchema: z.object({ applicationId: z.number().int().positive(), ...fields, outcome: outcome.optional() }),
  annotations: WRITES,
  async handler(userId, { applicationId, ...input }) {
    return addInterview(userId, applicationId, input);
  },
});

export const updateInterviewTool = defineTool({
  name: "update_interview",
  title: "Update an interview",
  description: "Update an interview round's time, round name, interviewer, prep notes or outcome.",
  inputSchema: z.object({ id: z.number().int().positive(), ...fields, outcome: outcome.optional() }),
  annotations: WRITES,
  async handler(userId, { id, ...input }) {
    await updateInterview(userId, id, input);
    return { id, updated: true };
  },
});
