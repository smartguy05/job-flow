import { z } from "zod";
import { appBaseUrl } from "@/lib/auth/oidc";
import { createResumeForApplication } from "@/lib/resume-service";
import { getResumeSummary } from "@/lib/services/resumes";
import { createDraft, DRAFT_TYPES } from "@/lib/services/drafts";
import { NotFoundError } from "@/lib/services/errors";
import { defineTool, WRITES } from "../tool";

const applicationId = z.number().int().positive();

export const generateResume = defineTool({
  name: "generate_resume",
  title: "Generate a tailored resume",
  description:
    "Generate a new tailored resume version for an application from the user's career profile (takes a minute " +
    "or two). Returns the version, page count and download links; the links open in the user's browser, where " +
    "they must be signed in to JobFlow.",
  inputSchema: z.object({ applicationId }),
  annotations: { ...WRITES, openWorldHint: true },
  async handler(userId, args) {
    let resumeId: number;
    try {
      resumeId = await createResumeForApplication(userId, args.applicationId);
    } catch (e) {
      if ((e as Error).message === "Application not found") throw new NotFoundError("Application not found");
      throw e;
    }
    const summary = await getResumeSummary(userId, resumeId);
    const base = appBaseUrl();
    return {
      resumeId,
      version: summary.version,
      status: summary.status,
      pageCount: summary.pageCount,
      fitWarning: summary.fitWarning,
      downloads: {
        pdf: `${base}/api/resumes/${resumeId}/download?fmt=pdf`,
        docx: `${base}/api/resumes/${resumeId}/download?fmt=docx`,
      },
      applicationUrl: `${base}/applications/${args.applicationId}`,
    };
  },
});

export const draftMessage = defineTool({
  name: "draft_message",
  title: "Draft a message",
  description:
    "Draft a recruiter reply, cover letter or follow-up for an application in the user's voice, using only facts " +
    "from their career profile. The draft is saved on the application.",
  inputSchema: z.object({
    applicationId,
    type: z.enum(DRAFT_TYPES).optional().describe("Defaults to reply"),
    extra: z.string().optional().describe("Extra instructions or context for this draft"),
  }),
  annotations: { ...WRITES, openWorldHint: true },
  async handler(userId, args) {
    return createDraft(userId, args.applicationId, { type: args.type, extra: args.extra });
  },
});
