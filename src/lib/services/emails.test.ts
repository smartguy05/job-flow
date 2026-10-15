import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ classifyEmail: vi.fn() }));

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { classifyEmail } from "@/lib/llm";
import type { EmailClassification } from "@/lib/email-content";
import { insertApp, seedUser } from "@/test/req";
import { NotFoundError, ValidationError } from "./errors";
import { applyEmailActions, ingestEmail, listRecentEmails } from "./emails";

const mockClassify = vi.mocked(classifyEmail);
const uid = () => globalThis.__testUserId;

const cls = (over: Partial<EmailClassification> = {}): EmailClassification => ({
  kind: "rejection",
  company: null,
  roleTitle: null,
  interviewAt: null,
  summary: "Not moving forward",
  suggestedNextAction: null,
  ...over,
});

const email = (messageId: string, from: string, over: Record<string, unknown> = {}) => ({
  messageId,
  from,
  subject: "Your application",
  date: "2026-10-01T12:00:00Z",
  body: "Thank you for your interest...",
  ...over,
});

const getApp = async (id: number) =>
  (await db.select().from(schema.applications).where(eq(schema.applications.id, id)))[0];
const eventsFor = (id: number) => db.select().from(schema.events).where(eq(schema.events.applicationId, id));

beforeEach(() => {
  mockClassify.mockReset();
  mockClassify.mockResolvedValue(cls());
});

describe("ingestEmail", () => {
  it("classifies, matches and proposes without applying by default", async () => {
    const id = await insertApp({ company: "Umbrella", companyNormalized: "umbrella" });
    const out = await ingestEmail(uid(), email("m-propose", "HR <hr@umbrella.com>"));
    expect(mockClassify).toHaveBeenCalledWith(expect.objectContaining({ userId: uid(), from: "HR <hr@umbrella.com>" }));
    expect(out.classification.kind).toBe("rejection");
    expect(out.match?.applicationId).toBe(id);
    expect(out.proposedActions).toEqual([
      { type: "set_status", status: "closed_lost" },
      { type: "log_event", detail: "Email (rejection): Not moving forward" },
    ]);
    expect(out.applied).toBe(false);
    expect((await getApp(id)).status).toBe("applied");
    const [row] = await db
      .select()
      .from(schema.ingestedEmails)
      .where(and(eq(schema.ingestedEmails.userId, uid()), eq(schema.ingestedEmails.messageId, "m-propose")));
    expect(row).toMatchObject({ kind: "rejection", summary: "Not moving forward", appliedAt: null, applicationId: null });
    expect(row.receivedAt?.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });

  it("applies when asked and the match is confident, then is idempotent", async () => {
    const id = await insertApp({ company: "Vandelay", companyNormalized: "vandelay" });
    const out = await ingestEmail(uid(), { ...email("m-apply", "jobs@vandelay.com"), apply: true });
    expect(out.applied).toBe(true);
    expect(out.applicationId).toBe(id);
    expect((await getApp(id)).status).toBe("closed_lost");
    const ev = await eventsFor(id);
    expect(ev.filter((e) => e.type === "email")).toHaveLength(1);
    expect(ev.some((e) => e.type === "status_change" && e.detail === "applied → closed_lost")).toBe(true);

    mockClassify.mockClear();
    const again = await ingestEmail(uid(), { ...email("m-apply", "jobs@vandelay.com"), apply: true });
    expect(again.alreadyApplied).toBe(true);
    expect(again.applied).toBe(false);
    expect(again.applicationId).toBe(id);
    expect(mockClassify).not.toHaveBeenCalled();
    expect((await eventsFor(id)).filter((e) => e.type === "email")).toHaveLength(1);
  });

  it("does not apply when the match is ambiguous", async () => {
    await insertApp({ company: "Soylent", companyNormalized: "soylent", roleTitle: "Backend Engineer" });
    await insertApp({ company: "Soylent", companyNormalized: "soylent", roleTitle: "Frontend Engineer" });
    const out = await ingestEmail(uid(), { ...email("m-ambig", "people@soylent.com"), apply: true });
    expect(out.applied).toBe(false);
    expect(out.match).toBeNull();
    expect(out.candidates).toHaveLength(2);
    expect(out.note).toMatch(/ask the user/i);
  });

  it("adds an interview for an invite", async () => {
    mockClassify.mockResolvedValue(cls({ kind: "interview_invite", interviewAt: "2026-11-05T16:00:00.000Z", summary: "Tech screen" }));
    const id = await insertApp({ company: "Massive Dynamic", companyNormalized: "massivedynamic" });
    const out = await ingestEmail(uid(), { ...email("m-invite", "recruiting@massivedynamic.com"), apply: true });
    expect(out.applied).toBe(true);
    expect((await getApp(id)).status).toBe("in_progress");
    const iv = await db.select().from(schema.interviews).where(eq(schema.interviews.applicationId, id));
    expect(iv).toHaveLength(1);
    expect(iv[0].scheduledAt?.toISOString()).toBe("2026-11-05T16:00:00.000Z");
  });

  it("never matches another user's applications", async () => {
    const other = await seedUser("emails-ingest-other");
    await insertApp({ userId: other.id, company: "Cyberdyne", companyNormalized: "cyberdyne" });
    const out = await ingestEmail(uid(), { ...email("m-tenant", "hr@cyberdyne.com"), apply: true });
    expect(out.candidates).toEqual([]);
    expect(out.applied).toBe(false);
  });

  it("keeps message ids separate per user", async () => {
    const other = await seedUser("emails-ingest-other-2");
    const theirs = await insertApp({ userId: other.id, company: "Tyrell", companyNormalized: "tyrell" });
    const out = await ingestEmail(other.id, { ...email("m-shared-id", "hr@tyrell.com"), apply: true });
    expect(out.applied).toBe(true);
    expect(out.applicationId).toBe(theirs);
    const mine = await ingestEmail(uid(), email("m-shared-id", "hr@tyrell.com"));
    expect(mine.alreadyApplied).toBe(false);
  });
});

describe("applyEmailActions", () => {
  it("applies user-resolved actions to the chosen application once", async () => {
    await insertApp({ company: "Wonka", companyNormalized: "wonka", roleTitle: "Backend Engineer" });
    const id = await insertApp({ company: "Wonka", companyNormalized: "wonka", roleTitle: "Frontend Engineer" });
    mockClassify.mockResolvedValue(cls({ kind: "recruiter_reply", summary: "Wants a call" }));
    await ingestEmail(uid(), email("m-resolve", "talent@wonka.com"));
    const res = await applyEmailActions(uid(), {
      messageId: "m-resolve",
      applicationId: id,
      actions: [{ type: "set_next_action", nextAction: "Book a call", nextActionDate: "2026-10-20" }],
    });
    expect(res).toMatchObject({ applied: true, applicationId: id });
    const app = await getApp(id);
    expect(app.nextAction).toBe("Book a call");
    expect(app.nextActionDate?.toISOString().slice(0, 10)).toBe("2026-10-20");
    // An email event is always logged, even when the caller passes no log_event.
    const ev = (await eventsFor(id)).filter((e) => e.type === "email");
    expect(ev.map((e) => e.detail)).toEqual(["Email (recruiter reply): Wants a call"]);
    const [row] = await db.select().from(schema.ingestedEmails).where(eq(schema.ingestedEmails.messageId, "m-resolve"));
    expect(row.applicationId).toBe(id);
    expect(row.appliedAt).not.toBeNull();
    expect(JSON.parse(row.actions!)).toHaveLength(1);

    await expect(
      applyEmailActions(uid(), { messageId: "m-resolve", applicationId: id, actions: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("uses explicit log_event details instead of the default", async () => {
    const id = await insertApp({ company: "Prestige", companyNormalized: "prestige" });
    await ingestEmail(uid(), email("m-log", "x@unrelated.example"));
    await applyEmailActions(uid(), {
      messageId: "m-log",
      applicationId: id,
      actions: [{ type: "log_event", detail: "Custom note" }, { type: "add_interview", scheduledAt: null }],
    });
    const ev = (await eventsFor(id)).filter((e) => e.type === "email");
    expect(ev.map((e) => e.detail)).toEqual(["Custom note"]);
    const iv = await db.select().from(schema.interviews).where(eq(schema.interviews.applicationId, id));
    expect(iv[0].round).toBe("Interview (from email)");
  });

  it("requires the message to have been ingested", async () => {
    const id = await insertApp();
    await expect(
      applyEmailActions(uid(), { messageId: "never-seen", applicationId: id, actions: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses another user's application or message", async () => {
    const other = await seedUser("emails-apply-other");
    const theirs = await insertApp({ userId: other.id, company: "Oscorp", companyNormalized: "oscorp" });
    await ingestEmail(uid(), email("m-cross", "a@b.example"));
    await expect(
      applyEmailActions(uid(), { messageId: "m-cross", applicationId: theirs, actions: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const mine = await insertApp();
    await ingestEmail(other.id, email("m-theirs-only", "a@b.example"));
    await expect(
      applyEmailActions(uid(), { messageId: "m-theirs-only", applicationId: mine, actions: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await getApp(theirs)).status).toBe("applied");
  });

  it("releases the claim when an action fails so it can be retried", async () => {
    const id = await insertApp({ company: "Retry", companyNormalized: "retry" });
    await ingestEmail(uid(), email("m-retry", "a@b.example"));
    await expect(
      applyEmailActions(uid(), {
        messageId: "m-retry",
        applicationId: id,
        actions: [{ type: "set_next_action", nextAction: "x", nextActionDate: "not-a-date" }],
      }),
    ).rejects.toThrow();
    const [row] = await db.select().from(schema.ingestedEmails).where(eq(schema.ingestedEmails.messageId, "m-retry"));
    expect(row.appliedAt).toBeNull();
    await applyEmailActions(uid(), { messageId: "m-retry", applicationId: id, actions: [] });
  });
});

describe("listRecentEmails", () => {
  it("lists the user's processed emails newest first with the matched application", async () => {
    const other = await seedUser("emails-list-other");
    const id = await insertApp({ company: "Listing Co", companyNormalized: "listingco" });
    await ingestEmail(uid(), { ...email("m-list-1", "hr@listingco.com"), apply: true });
    await ingestEmail(other.id, email("m-list-theirs", "hr@elsewhere.example"));
    const rows = await listRecentEmails(uid(), 50);
    expect(rows.find((r) => r.messageId === "m-list-theirs")).toBeUndefined();
    const row = rows.find((r) => r.messageId === "m-list-1")!;
    expect(row).toMatchObject({ applicationId: id, company: "Listing Co", kind: "rejection" });
    expect(row.appliedAt).not.toBeNull();
    for (let i = 1; i < rows.length; i++) {
      expect(new Date(rows[i - 1].processedAt).getTime()).toBeGreaterThanOrEqual(new Date(rows[i].processedAt).getTime());
    }
    expect(await listRecentEmails(uid(), 1)).toHaveLength(1);
  });
});
