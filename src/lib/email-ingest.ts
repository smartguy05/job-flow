import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeCompany, roleSimilarity } from "@/lib/dedup";
import { STATUS_ORDER } from "@/lib/ui";
import type { EmailClassification, EmailKind } from "@/lib/email-content";

// Email → application matching and action proposals. Everything here is pure except
// loadCandidateApps (the DB loader); services/emails.ts orchestrates and applies.

// Shared senders that say nothing about the employer: free mail, ATS vendors and job boards.
// Matching a sender (or a posting link) on one of these would tie every Greenhouse email to
// every Greenhouse application, so they never count as a domain signal.
const GENERIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "fastmail.com", "gmx.com",
  "greenhouse.io", "lever.co", "ashbyhq.com", "myworkday.com", "myworkdayjobs.com", "workday.com",
  "icims.com", "smartrecruiters.com", "jobvite.com", "workable.com", "bamboohr.com", "breezy.hr",
  "recruitee.com", "taleo.net", "successfactors.com", "rippling.com", "rippling-ats.com", "gem.com",
  "teamtailor.com", "pinpointhq.com", "jazzhr.com", "applytojob.com", "paylocity.com", "ultipro.com",
  "linkedin.com", "indeed.com", "indeedemail.com", "ziprecruiter.com", "glassdoor.com", "dice.com",
  "wellfound.com", "angel.co", "hired.com", "otta.com", "builtin.com", "monster.com",
]);

export const CONFIDENT_THRESHOLD = 0.75;
const CONFIDENT_LEAD = 0.1;
const CLOSED = new Set(["closed_won", "closed_lost", "expired"]);

export type CandidateApp = {
  id: number;
  company: string;
  companyNormalized: string;
  roleTitle: string;
  status: string;
  link: string | null;
  contactEmail: string | null;
};

export type MatchCandidate = {
  applicationId: number;
  company: string;
  roleTitle: string;
  status: string;
  confidence: number;
  reasons: string[];
};

// "Jane <jane@x.com>" or "jane@x.com" → lower-cased address + domain.
export function parseSender(from: string): { email: string | null; domain: string | null } {
  const m = from.match(/<([^<>\s]+@[^<>\s]+)>/) ?? from.match(/([^\s<>"']+@[^\s<>"']+)/);
  if (!m) return { email: null, domain: null };
  const email = m[1].toLowerCase().replace(/[.,;]+$/, "");
  return { email, domain: email.split("@")[1] || null };
}

// Approximate registrable domain: the last two labels, or three for two-letter ccTLDs with a
// short second level (globex.co.uk). Good enough to compare mail.x.com with careers.x.com.
export function baseDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  const take = tld.length === 2 && sld.length <= 3 ? 3 : 2;
  return labels.slice(-take).join(".");
}

function linkBase(link: string | null): string | null {
  if (!link) return null;
  try {
    return baseDomain(new URL(link).hostname);
  } catch {
    return null;
  }
}

// Rank the user's applications as the subject of an email, in signal order:
//   1. sender address = the application's contact email,
//   2. sender domain = the posting link's host, or ≈ the normalized company,
//   3. the classifier's company (+ role similarity).
// Several signals add a small bonus; closed applications lose a little so an open one wins
// a tie. Returns at most five candidates with confidence in (0, 0.99].
export function rankCandidates(
  input: { from: string; company?: string | null; roleTitle?: string | null },
  apps: CandidateApp[],
): MatchCandidate[] {
  const sender = parseSender(input.from);
  const senderBase = sender.domain ? baseDomain(sender.domain) : null;
  const usableBase = senderBase && !GENERIC_DOMAINS.has(senderBase) ? senderBase : null;
  const senderLabel = usableBase ? normalizeCompany(usableBase.split(".")[0]) : null;
  const extractedCompany = input.company ? normalizeCompany(input.company) : "";

  const out: MatchCandidate[] = [];
  for (const app of apps) {
    const signals: { score: number; reason: string }[] = [];

    if (sender.email && app.contactEmail && app.contactEmail.trim().toLowerCase() === sender.email) {
      signals.push({ score: 0.95, reason: "sender is the application's contact" });
    }
    if (usableBase) {
      const host = linkBase(app.link);
      if (host && !GENERIC_DOMAINS.has(host) && host === usableBase) {
        signals.push({ score: 0.85, reason: `sender domain matches the posting link (${host})` });
      }
      const norm = app.companyNormalized;
      if (senderLabel && norm) {
        if (senderLabel === norm) {
          signals.push({ score: 0.8, reason: `sender domain matches the company (${usableBase})` });
        } else if (
          Math.min(senderLabel.length, norm.length) >= 4 &&
          (senderLabel.startsWith(norm) || norm.startsWith(senderLabel))
        ) {
          signals.push({ score: 0.65, reason: `sender domain resembles the company (${usableBase})` });
        }
      }
    }
    if (extractedCompany && extractedCompany === app.companyNormalized) {
      if (input.roleTitle) {
        const sim = roleSimilarity(input.roleTitle, app.roleTitle);
        signals.push({ score: 0.6 + 0.35 * sim, reason: `company and role named in the email (role similarity ${sim.toFixed(2)})` });
      } else {
        signals.push({ score: 0.6, reason: "company named in the email" });
      }
    }

    if (signals.length === 0) continue;
    let confidence = Math.max(...signals.map((s) => s.score)) + 0.05 * (signals.length - 1);
    if (CLOSED.has(app.status)) confidence -= 0.05;
    confidence = Math.round(Math.min(0.99, confidence) * 100) / 100;
    out.push({
      applicationId: app.id,
      company: app.company,
      roleTitle: app.roleTitle,
      status: app.status,
      confidence,
      reasons: signals.sort((a, b) => b.score - a.score).map((s) => s.reason),
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence || b.applicationId - a.applicationId).slice(0, 5);
}

// The single match safe to act on without asking: above the threshold with a clear lead.
export function pickConfidentMatch(candidates: MatchCandidate[]): MatchCandidate | null {
  const [top, second] = candidates;
  if (!top || top.confidence < CONFIDENT_THRESHOLD) return null;
  if (second && top.confidence - second.confidence < CONFIDENT_LEAD) return null;
  return top;
}

// The user's applications in the shape rankCandidates needs (contact email joined in).
export async function loadCandidateApps(userId: string): Promise<CandidateApp[]> {
  return db
    .select({
      id: schema.applications.id,
      company: schema.applications.company,
      companyNormalized: schema.applications.companyNormalized,
      roleTitle: schema.applications.roleTitle,
      status: schema.applications.status,
      link: schema.applications.link,
      contactEmail: schema.contacts.email,
    })
    .from(schema.applications)
    .leftJoin(
      schema.contacts,
      and(eq(schema.contacts.id, schema.applications.contactId), eq(schema.contacts.userId, userId)),
    )
    .where(eq(schema.applications.userId, userId));
}

// --- Actions ---

const isoDateTime = z
  .string()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "use an ISO 8601 date-time");

// Every action an email can lead to. A closed set: callers (including Claude, relaying a
// possibly prompt-injected email) can't express anything outside it.
export const EmailActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_status"), status: z.enum(STATUS_ORDER as [string, ...string[]]) }),
  z.object({
    type: z.literal("add_interview"),
    scheduledAt: isoDateTime.nullable().optional(),
    round: z.string().trim().min(1).max(200).optional(),
  }),
  z.object({
    type: z.literal("set_next_action"),
    nextAction: z.string().trim().min(1).max(500),
    nextActionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "use an ISO date (YYYY-MM-DD)").nullable().optional(),
  }),
  z.object({ type: z.literal("log_event"), detail: z.string().trim().min(1).max(500) }),
]);

export const EmailActionsSchema = z.array(EmailActionSchema).max(10);

export type EmailAction = z.infer<typeof EmailActionSchema>;

export const INTERVIEW_ROUND = "Interview (from email)";

export function emailEventDetail(kind: EmailKind, summary: string): string {
  const label = `Email (${kind.replace(/_/g, " ")})`;
  return summary ? `${label}: ${summary}` : label;
}

// Map a classification to proposed actions for the matched application. `currentStatus`
// (when known) suppresses a no-op status change. Every kind logs an `email` event.
export function proposeActions(c: EmailClassification, currentStatus?: string | null): EmailAction[] {
  const actions: EmailAction[] = [];
  const setStatus = (status: string) => {
    if (currentStatus !== status) actions.push({ type: "set_status", status });
  };
  switch (c.kind) {
    case "rejection":
      setStatus("closed_lost");
      break;
    case "interview_invite":
      setStatus("in_progress");
      actions.push({ type: "add_interview", scheduledAt: c.interviewAt, round: INTERVIEW_ROUND });
      break;
    case "offer":
      setStatus("in_progress");
      actions.push({ type: "set_next_action", nextAction: c.suggestedNextAction ?? "Review the offer" });
      break;
    case "recruiter_reply":
      actions.push({ type: "set_next_action", nextAction: c.suggestedNextAction ?? "Reply to the recruiter" });
      break;
  }
  actions.push({ type: "log_event", detail: emailEventDetail(c.kind, c.summary) });
  return actions;
}
