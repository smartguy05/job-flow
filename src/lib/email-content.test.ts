import { describe, it, expect } from "vitest";
import { EMAIL_KINDS, EmailClassificationSchema } from "./email-content";

describe("EmailClassificationSchema", () => {
  it("parses a full classification", () => {
    const c = EmailClassificationSchema.parse({
      kind: "interview_invite",
      company: " Initech ",
      roleTitle: "Platform Engineer",
      interviewAt: "2026-11-02T15:00:00Z",
      summary: "Invite to a technical screen",
      suggestedNextAction: "Confirm the time",
    });
    expect(c).toEqual({
      kind: "interview_invite",
      company: "Initech",
      roleTitle: "Platform Engineer",
      interviewAt: "2026-11-02T15:00:00.000Z",
      summary: "Invite to a technical screen",
      suggestedNextAction: "Confirm the time",
    });
  });

  it("falls back to `other` for an unknown kind and nulls missing/blank fields", () => {
    const c = EmailClassificationSchema.parse({ kind: "spam", company: "", summary: "  hi  " });
    expect(c).toEqual({
      kind: "other",
      company: null,
      roleTitle: null,
      interviewAt: null,
      summary: "hi",
      suggestedNextAction: null,
    });
  });

  it("drops an unparseable interview date and caps long strings", () => {
    const c = EmailClassificationSchema.parse({
      kind: "rejection",
      interviewAt: "next tuesday-ish",
      summary: "x".repeat(2000),
      suggestedNextAction: "y".repeat(2000),
    });
    expect(c.interviewAt).toBeNull();
    expect(c.summary.length).toBeLessThanOrEqual(500);
    expect(c.suggestedNextAction!.length).toBeLessThanOrEqual(200);
  });

  it("defaults the summary when missing", () => {
    expect(EmailClassificationSchema.parse({ kind: "offer" }).summary).toBe("");
  });

  it("lists every kind", () => {
    expect(EMAIL_KINDS).toEqual(["rejection", "interview_invite", "recruiter_reply", "offer", "application_ack", "other"]);
  });
});
