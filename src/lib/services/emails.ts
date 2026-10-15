import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { classifyEmail } from "@/lib/llm";
import { logEvent } from "@/lib/events";
import type { EmailClassification, EmailKind } from "@/lib/email-content";
import {
  EmailActionsSchema,
  emailEventDetail,
  INTERVIEW_ROUND,
  loadCandidateApps,
  pickConfidentMatch,
  proposeActions,
  rankCandidates,
  type EmailAction,
  type MatchCandidate,
} from "@/lib/email-ingest";
import { updateApplication } from "./applications";
import { addInterview } from "./interviews";
import { NotFoundError, ValidationError } from "./errors";

// Email ingestion (driven over MCP: Claude reads Gmail with the user's own connector and
// hands each message here). JobFlow stores only the message id, sender, subject, kind and a
// one-line summary — never the body.

export type IngestEmailInput = {
  messageId: string;
  from: string;
  subject: string;
  date?: string | null;
  body: string;
  apply?: boolean;
};

export type IngestEmailResult = {
  messageId: string;
  alreadyApplied: boolean;
  classification: Pick<EmailClassification, "kind" | "summary"> & Partial<EmailClassification>;
  candidates: MatchCandidate[];
  match: MatchCandidate | null;
  proposedActions: EmailAction[];
  applied: boolean;
  applicationId: number | null;
  note?: string;
};

const rowScope = (userId: string, messageId: string) =>
  and(eq(schema.ingestedEmails.userId, userId), eq(schema.ingestedEmails.messageId, messageId));

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Classify an email, rank the user's applications as its subject and propose actions.
// Records the message (idempotent on (user, messageId)). With `apply`, the actions run only
// when there is one confident match; otherwise the caller should ask the user and use
// applyEmailActions. A message whose actions were already applied short-circuits (no LLM call).
export async function ingestEmail(userId: string, input: IngestEmailInput): Promise<IngestEmailResult> {
  const [existing] = await db.select().from(schema.ingestedEmails).where(rowScope(userId, input.messageId)).limit(1);
  if (existing?.appliedAt) {
    return {
      messageId: input.messageId,
      alreadyApplied: true,
      classification: { kind: existing.kind as EmailKind, summary: existing.summary },
      candidates: [],
      match: null,
      proposedActions: [],
      applied: false,
      applicationId: existing.applicationId,
      note: "Already processed: this email's actions were applied earlier.",
    };
  }

  const classification = await classifyEmail({
    userId,
    from: input.from,
    subject: input.subject,
    date: input.date,
    body: input.body,
  });
  const candidates = rankCandidates(
    { from: input.from, company: classification.company, roleTitle: classification.roleTitle },
    await loadCandidateApps(userId),
  );
  const match = pickConfidentMatch(candidates);
  const proposedActions = proposeActions(classification, (match ?? candidates[0])?.status ?? null);

  const record = {
    kind: classification.kind,
    summary: classification.summary,
    fromAddress: input.from.slice(0, 500),
    subject: input.subject.slice(0, 500),
    receivedAt: parseDate(input.date),
    processedAt: new Date(),
  };
  await db
    .insert(schema.ingestedEmails)
    .values({ userId, messageId: input.messageId, ...record })
    .onConflictDoUpdate({
      target: [schema.ingestedEmails.userId, schema.ingestedEmails.messageId],
      set: record,
      setWhere: isNull(schema.ingestedEmails.appliedAt),
    });

  const result: IngestEmailResult = {
    messageId: input.messageId,
    alreadyApplied: false,
    classification,
    candidates,
    match,
    proposedActions,
    applied: false,
    applicationId: null,
  };

  if (input.apply) {
    if (match) {
      await applyEmailActions(userId, { messageId: input.messageId, applicationId: match.applicationId, actions: proposedActions });
      result.applied = true;
      result.applicationId = match.applicationId;
    } else {
      result.note =
        "Not applied: no single confident match. Ask the user which application this email is about, then call " +
        "apply_email_actions with that applicationId and the actions they approve.";
    }
  }
  return result;
}

// Apply actions from an ingested email to one of the user's applications. The message's
// row is claimed atomically (appliedAt set where null) so actions never run twice; if an
// action fails the claim is released so the call can be retried. An `email` event is always
// logged (the default detail when no log_event action is given).
export async function applyEmailActions(
  userId: string,
  input: { messageId: string; applicationId: number; actions: EmailAction[] },
): Promise<{ applied: true; applicationId: number; actions: EmailAction[]; interviewIds: number[] }> {
  const actions = EmailActionsSchema.parse(input.actions);
  const [app] = await db
    .select({ id: schema.applications.id })
    .from(schema.applications)
    .where(and(eq(schema.applications.id, input.applicationId), eq(schema.applications.userId, userId)))
    .limit(1);
  if (!app) throw new NotFoundError("Application not found");

  const [claimed] = await db
    .update(schema.ingestedEmails)
    .set({ appliedAt: new Date(), applicationId: app.id, actions: JSON.stringify(actions) })
    .where(and(rowScope(userId, input.messageId), isNull(schema.ingestedEmails.appliedAt)))
    .returning();
  if (!claimed) {
    const [row] = await db
      .select({ id: schema.ingestedEmails.id })
      .from(schema.ingestedEmails)
      .where(rowScope(userId, input.messageId))
      .limit(1);
    if (!row) throw new NotFoundError("Unknown messageId: call ingest_email for this message first");
    throw new ValidationError("This email's actions were already applied");
  }

  const interviewIds: number[] = [];
  try {
    let logged = false;
    for (const a of actions) {
      switch (a.type) {
        case "set_status":
          await updateApplication(userId, app.id, { status: a.status });
          break;
        case "add_interview":
          interviewIds.push(
            (await addInterview(userId, app.id, { scheduledAt: a.scheduledAt ?? null, round: a.round ?? INTERVIEW_ROUND })).id,
          );
          break;
        case "set_next_action":
          await updateApplication(userId, app.id, { nextAction: a.nextAction, nextActionDate: a.nextActionDate ?? null });
          break;
        case "log_event":
          await logEvent(userId, app.id, "email", a.detail);
          logged = true;
          break;
      }
    }
    if (!logged) await logEvent(userId, app.id, "email", emailEventDetail(claimed.kind as EmailKind, claimed.summary));
  } catch (e) {
    await db
      .update(schema.ingestedEmails)
      .set({ appliedAt: null, applicationId: null, actions: null })
      .where(eq(schema.ingestedEmails.id, claimed.id));
    throw e;
  }
  return { applied: true, applicationId: app.id, actions, interviewIds };
}

// The user's most recently processed emails with the application each was applied to.
export async function listRecentEmails(userId: string, limit = 10) {
  const n = Math.min(Math.max(Math.trunc(limit) || 10, 1), 100);
  return db
    .select({
      id: schema.ingestedEmails.id,
      messageId: schema.ingestedEmails.messageId,
      kind: schema.ingestedEmails.kind,
      summary: schema.ingestedEmails.summary,
      fromAddress: schema.ingestedEmails.fromAddress,
      subject: schema.ingestedEmails.subject,
      receivedAt: schema.ingestedEmails.receivedAt,
      processedAt: schema.ingestedEmails.processedAt,
      appliedAt: schema.ingestedEmails.appliedAt,
      applicationId: schema.ingestedEmails.applicationId,
      company: schema.applications.company,
      roleTitle: schema.applications.roleTitle,
    })
    .from(schema.ingestedEmails)
    .leftJoin(
      schema.applications,
      and(eq(schema.applications.id, schema.ingestedEmails.applicationId), eq(schema.applications.userId, userId)),
    )
    .where(eq(schema.ingestedEmails.userId, userId))
    .orderBy(desc(schema.ingestedEmails.processedAt), desc(schema.ingestedEmails.id))
    .limit(n);
}
