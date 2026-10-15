import { z } from "zod";
import { EmailActionsSchema } from "@/lib/email-ingest";
import { applyEmailActions, ingestEmail } from "@/lib/services/emails";
import { defineTool, WRITES } from "../tool";

export const ingestEmailTool = defineTool({
  name: "ingest_email",
  title: "Ingest a job-search email",
  description:
    "Hand JobFlow one email about the user's job search (read from their mailbox with your own mail tools). " +
    "JobFlow classifies it (rejection, interview_invite, recruiter_reply, offer, application_ack, other), ranks the " +
    "user's applications it could be about, and proposes actions (e.g. a rejection proposes status closed_lost). " +
    "Nothing changes unless `apply` is true AND there is a single confident match; otherwise show the user the " +
    "candidates and proposed actions and, once they confirm, call apply_email_actions. Re-sending a message whose " +
    "actions were already applied is a no-op. Only the sender, subject, kind and a short summary are stored.",
  inputSchema: z.object({
    messageId: z.string().trim().min(1).max(500).describe("The mail provider's message id (e.g. Gmail message id)"),
    from: z.string().trim().min(1).max(500).describe('Sender, e.g. "Jane Doe <jane@company.com>"'),
    subject: z.string().max(1000).describe("Subject line"),
    date: z.string().max(100).optional().describe("When the email was received (ISO 8601 preferred)"),
    body: z.string().max(200_000).describe("Plain-text body"),
    apply: z.boolean().optional().describe("Apply the proposed actions when there is one confident match"),
  }),
  annotations: WRITES,
  async handler(userId, args) {
    return ingestEmail(userId, args);
  },
});

export const applyEmailActionsTool = defineTool({
  name: "apply_email_actions",
  title: "Apply actions from an email",
  description:
    "Apply actions from a previously ingested email to the application the user chose. Use after ingest_email " +
    "when the match was ambiguous or the user edited the proposals. Actions: set_status {status}, add_interview " +
    "{scheduledAt?, round?}, set_next_action {nextAction, nextActionDate?}, log_event {detail}. An email timeline " +
    "event is always logged. Each message can be applied once.",
  inputSchema: z.object({
    messageId: z.string().trim().min(1).max(500),
    applicationId: z.number().int().positive(),
    actions: EmailActionsSchema,
  }),
  annotations: WRITES,
  async handler(userId, args) {
    return applyEmailActions(userId, args);
  },
});
