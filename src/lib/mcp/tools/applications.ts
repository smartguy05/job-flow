import { z } from "zod";
import { extractJob } from "@/lib/llm";
import { findDuplicates } from "@/lib/dedup";
import { getSettings } from "@/lib/settings";
import { filterApplications } from "@/lib/dashboard-filter";
import { STATUS_ORDER } from "@/lib/ui";
import {
  createApplication,
  getApplicationDetail,
  listApplications,
  updateApplication,
} from "@/lib/services/applications";
import { defineTool, READ_ONLY, WRITES } from "../tool";

const status = z.enum(STATUS_ORDER as [string, ...string[]]);
const id = z.number().int().positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "use an ISO date (YYYY-MM-DD)");

const iso = (d: Date | null) => (d ? d.toISOString() : null);

type ListedApp = Awaited<ReturnType<typeof listApplications>>[number];

// A compact row for list results: no JD text, notes or detail columns.
function summarize(a: ListedApp) {
  return {
    id: a.id,
    company: a.company,
    roleTitle: a.roleTitle,
    status: a.status,
    appliedAt: iso(a.appliedAt),
    lastActivityAt: a.lastActivityAt.toISOString(),
    nextAction: a.nextAction,
    nextActionDate: iso(a.nextActionDate),
    interestRating: a.interestRating,
    link: a.link,
    location: a.location,
    locationMode: a.locationMode,
    contact: a.contact ? { name: a.contact.name, agency: a.contact.agency, email: a.contact.email } : null,
    resumeCount: a.resumeCount,
  };
}

export const captureJob = defineTool({
  name: "capture_job",
  title: "Capture a job",
  description:
    "Extract a job application from pasted text (a recruiter message, job description or posting) and check it " +
    "against the user's recent applications for duplicates. Nothing is saved unless `save` is true; a save is held " +
    "back when likely duplicates exist unless `allowDuplicate` is also true. Show the user the extracted fields " +
    "before saving.",
  inputSchema: z.object({
    text: z.string().trim().min(1).describe("The recruiter message, job description or posting text"),
    companyHint: z.string().optional().describe("Company name, if known but not in the text"),
    contactHint: z.string().optional().describe("Recruiter name, if known but not in the text"),
    save: z.boolean().optional().describe("Create the application after extracting"),
    markApplied: z.boolean().optional().describe("When saving, mark it applied today"),
    allowDuplicate: z.boolean().optional().describe("Save even if likely duplicates were found"),
  }),
  annotations: WRITES,
  async handler(userId, args) {
    const extracted = await extractJob({
      userId,
      text: args.text,
      companyHint: args.companyHint,
      contactHint: args.contactHint,
    });
    const settings = await getSettings(userId);
    const duplicates =
      extracted.company && extracted.roleTitle
        ? await findDuplicates(userId, extracted.company, extracted.roleTitle, settings.dedupWindowDays)
        : [];

    let saved: { id: number } | null = null;
    let note: string | undefined;
    if (args.save) {
      if (duplicates.length > 0 && !args.allowDuplicate) {
        note = "Not saved: likely duplicate(s) found. Confirm with the user, then call again with allowDuplicate.";
      } else {
        saved = await createApplication(userId, {
          ...extracted,
          sourceRaw: args.text,
          markApplied: args.markApplied ?? false,
        });
      }
    }
    return { extracted, duplicates, dedupWindowDays: settings.dedupWindowDays, saved, ...(note ? { note } : {}) };
  },
});

export const listApplicationsTool = defineTool({
  name: "list_applications",
  title: "List applications",
  description:
    "List the user's job applications, most recently active first. Closed and expired ones are hidden unless " +
    "`includeClosed` is true or a specific `status` is requested.",
  inputSchema: z.object({
    status: status.optional().describe("Only this status"),
    search: z.string().optional().describe("Case-insensitive substring of company or role"),
    includeClosed: z.boolean().optional(),
  }),
  annotations: READ_ONLY,
  async handler(userId, args) {
    const apps = await listApplications(userId);
    const shaped = apps.map((a) => ({
      app: a,
      status: a.status,
      company: a.company,
      roleTitle: a.roleTitle,
      appliedAt: iso(a.appliedAt),
      lastActivityAt: a.lastActivityAt.toISOString(),
      interestRating: a.interestRating,
    }));
    return filterApplications(shaped, {
      status: args.status ?? "all",
      query: args.search ?? "",
      includeClosed: args.includeClosed ?? false,
      sort: "activity",
    }).map((r) => summarize(r.app));
  },
});

export const getApplication = defineTool({
  name: "get_application",
  title: "Get an application",
  description:
    "Full detail for one application: fields, job description, contact, interviews, drafts, timeline events, " +
    "resume versions and file metadata (never file contents).",
  inputSchema: z.object({ id }),
  annotations: READ_ONLY,
  async handler(userId, args) {
    return getApplicationDetail(userId, args.id);
  },
});

export const updateApplicationTool = defineTool({
  name: "update_application",
  title: "Update an application",
  description:
    "Update fields on an application. Changing status logs a timeline event; moving to closed_won also creates " +
    "an employment-history job. Only the fields you pass change; pass null to clear one.",
  inputSchema: z.object({
    id,
    status: status.optional(),
    nextAction: z.string().nullable().optional().describe("The next thing the user should do"),
    nextActionDate: isoDate.nullable().optional(),
    notes: z.string().nullable().optional(),
    company: z.string().optional(),
    roleTitle: z.string().optional(),
    link: z.string().nullable().optional(),
    appliedAt: isoDate.nullable().optional(),
    interestRating: z.number().int().min(1).max(5).nullable().optional(),
    location: z.string().nullable().optional(),
    locationMode: z.enum(["remote", "hybrid", "onsite"]).nullable().optional(),
    payMin: z.number().nullable().optional(),
    payMax: z.number().nullable().optional(),
    pros: z.string().nullable().optional(),
    cons: z.string().nullable().optional(),
  }),
  annotations: WRITES,
  async handler(userId, { id: appId, ...fields }) {
    await updateApplication(userId, appId, fields);
    const detail = await getApplicationDetail(userId, appId);
    return summarize({ ...detail, resumeCount: detail.resumes.length });
  },
});
