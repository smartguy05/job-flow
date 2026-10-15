import { describe, it, expect } from "vitest";
import { db, schema } from "@/db";
import { insertApp, seedUser } from "@/test/req";
import {
  baseDomain,
  emailEventDetail,
  EmailActionsSchema,
  loadCandidateApps,
  parseSender,
  pickConfidentMatch,
  proposeActions,
  rankCandidates,
  type CandidateApp,
} from "./email-ingest";
import type { EmailClassification } from "./email-content";

const app = (over: Partial<CandidateApp> = {}): CandidateApp => ({
  id: 1,
  company: "Initech",
  companyNormalized: "initech",
  roleTitle: "Platform Engineer",
  status: "applied",
  link: null,
  contactEmail: null,
  ...over,
});

const cls = (over: Partial<EmailClassification> = {}): EmailClassification => ({
  kind: "other",
  company: null,
  roleTitle: null,
  interviewAt: null,
  summary: "summary",
  suggestedNextAction: null,
  ...over,
});

describe("parseSender", () => {
  it("handles display-name and bare forms", () => {
    expect(parseSender('"Jane Doe" <Jane@Mail.Initech.com>')).toEqual({ email: "jane@mail.initech.com", domain: "mail.initech.com" });
    expect(parseSender("bob@globex.co.uk")).toEqual({ email: "bob@globex.co.uk", domain: "globex.co.uk" });
    expect(parseSender("no address here")).toEqual({ email: null, domain: null });
  });
});

describe("baseDomain", () => {
  it("reduces hosts to their registrable domain", () => {
    expect(baseDomain("mail.initech.com")).toBe("initech.com");
    expect(baseDomain("www.globex.co.uk")).toBe("globex.co.uk");
    expect(baseDomain("initech.com")).toBe("initech.com");
    expect(baseDomain("localhost")).toBe("localhost");
  });
});

describe("rankCandidates", () => {
  it("ranks a contact email match highest", () => {
    const apps = [
      app({ id: 1, contactEmail: "Jane@Initech.com" }),
      app({ id: 2, company: "Globex", companyNormalized: "globex" }),
    ];
    const r = rankCandidates({ from: "Jane <jane@initech.com>" }, apps);
    expect(r[0].applicationId).toBe(1);
    expect(r[0].confidence).toBeGreaterThanOrEqual(0.9);
    expect(r[0].reasons.join(" ")).toMatch(/contact/i);
    expect(r.find((c) => c.applicationId === 2)).toBeUndefined();
  });

  it("matches the sender domain against the application link host", () => {
    const r = rankCandidates(
      { from: "noreply@mail.hooli.io" },
      [app({ id: 3, company: "Hooli XYZ", companyNormalized: "hoolixyz", link: "https://careers.hooli.io/jobs/9" })],
    );
    expect(r[0]).toMatchObject({ applicationId: 3 });
    expect(r[0].confidence).toBeGreaterThanOrEqual(0.8);
    expect(r[0].reasons.join(" ")).toMatch(/link/i);
  });

  it("matches the sender domain against the normalized company", () => {
    const r = rankCandidates({ from: "talent@initech.com" }, [app({ id: 4 })]);
    expect(r[0].applicationId).toBe(4);
    expect(r[0].confidence).toBeGreaterThanOrEqual(0.75);
    const prefix = rankCandidates({ from: "talent@globexcorp.com" }, [app({ id: 5, company: "Globex", companyNormalized: "globex" })]);
    expect(prefix[0].applicationId).toBe(5);
    expect(prefix[0].confidence).toBeLessThan(0.75);
  });

  it("never matches on ATS or free-mail domains", () => {
    const apps = [
      app({ id: 6, link: "https://boards.greenhouse.io/initech/jobs/1" }),
      app({ id: 7, company: "Gmail Fans", companyNormalized: "gmail" }),
    ];
    expect(rankCandidates({ from: "no-reply@greenhouse.io" }, apps)).toEqual([]);
    expect(rankCandidates({ from: "someone@gmail.com" }, apps)).toEqual([]);
  });

  it("uses the extracted company and role similarity", () => {
    const apps = [
      app({ id: 8, roleTitle: "Platform Engineer" }),
      app({ id: 9, roleTitle: "Data Scientist" }),
    ];
    const r = rankCandidates(
      { from: "no-reply@greenhouse.io", company: "Initech Inc.", roleTitle: "Senior Platform Engineer" },
      apps,
    );
    expect(r.map((c) => c.applicationId)).toEqual([8, 9]);
    expect(r[0].confidence).toBeGreaterThan(r[1].confidence);
    expect(pickConfidentMatch(r)?.applicationId).toBe(8);
  });

  it("boosts candidates with several signals and down-ranks closed applications", () => {
    const apps = [
      app({ id: 10, status: "closed_lost" }),
      app({ id: 11, contactEmail: "x@initech.com" }),
    ];
    const r = rankCandidates({ from: "x@initech.com", company: "Initech" }, apps);
    expect(r[0].applicationId).toBe(11);
    expect(r[0].confidence).toBeLessThanOrEqual(0.99);
  });
});

describe("pickConfidentMatch", () => {
  const c = (applicationId: number, confidence: number) => ({
    applicationId, company: "C", roleTitle: "R", status: "applied", confidence, reasons: [],
  });
  it("needs a single candidate above the threshold with a clear lead", () => {
    expect(pickConfidentMatch([])).toBeNull();
    expect(pickConfidentMatch([c(1, 0.6)])).toBeNull();
    expect(pickConfidentMatch([c(1, 0.8)])?.applicationId).toBe(1);
    expect(pickConfidentMatch([c(1, 0.8), c(2, 0.78)])).toBeNull();
    expect(pickConfidentMatch([c(1, 0.95), c(2, 0.7)])?.applicationId).toBe(1);
  });
});

describe("proposeActions", () => {
  it("maps a rejection to closed_lost plus an email event", () => {
    const a = proposeActions(cls({ kind: "rejection", summary: "No thanks" }), "applied");
    expect(a).toEqual([
      { type: "set_status", status: "closed_lost" },
      { type: "log_event", detail: "Email (rejection): No thanks" },
    ]);
  });

  it("skips a status change the application already has", () => {
    expect(proposeActions(cls({ kind: "rejection" }), "closed_lost").map((x) => x.type)).toEqual(["log_event"]);
  });

  it("maps an interview invite to an interview and in_progress", () => {
    const a = proposeActions(cls({ kind: "interview_invite", interviewAt: "2026-11-02T15:00:00.000Z" }), "applied");
    expect(a).toEqual([
      { type: "set_status", status: "in_progress" },
      { type: "add_interview", scheduledAt: "2026-11-02T15:00:00.000Z", round: "Interview (from email)" },
      expect.objectContaining({ type: "log_event" }),
    ]);
    expect(proposeActions(cls({ kind: "interview_invite" }), null)[1]).toEqual({
      type: "add_interview", scheduledAt: null, round: "Interview (from email)",
    });
  });

  it("maps an offer to in_progress plus a next action", () => {
    const a = proposeActions(cls({ kind: "offer" }), "in_progress");
    expect(a).toEqual([
      { type: "set_next_action", nextAction: "Review the offer" },
      expect.objectContaining({ type: "log_event" }),
    ]);
    expect(proposeActions(cls({ kind: "offer", suggestedNextAction: "Reply by Friday" }), "applied").slice(0, 2)).toEqual([
      { type: "set_status", status: "in_progress" },
      { type: "set_next_action", nextAction: "Reply by Friday" },
    ]);
  });

  it("maps a recruiter reply to a next action", () => {
    expect(proposeActions(cls({ kind: "recruiter_reply" }), "applied")[0]).toEqual({
      type: "set_next_action", nextAction: "Reply to the recruiter",
    });
  });

  it("only logs for acknowledgements and other mail", () => {
    expect(proposeActions(cls({ kind: "application_ack" }), "applied").map((x) => x.type)).toEqual(["log_event"]);
    expect(proposeActions(cls({ kind: "other" }), undefined).map((x) => x.type)).toEqual(["log_event"]);
  });

  it("produces actions that validate against the actions schema", () => {
    for (const kind of ["rejection", "interview_invite", "recruiter_reply", "offer", "application_ack", "other"] as const) {
      expect(() => EmailActionsSchema.parse(proposeActions(cls({ kind }), "applied"))).not.toThrow();
    }
  });
});

describe("emailEventDetail", () => {
  it("labels the kind and falls back when the summary is empty", () => {
    expect(emailEventDetail("offer", "Offer from Initech")).toBe("Email (offer): Offer from Initech");
    expect(emailEventDetail("application_ack", "")).toBe("Email (application ack)");
  });
});

describe("EmailActionsSchema", () => {
  it("rejects unknown statuses and action types", () => {
    expect(() => EmailActionsSchema.parse([{ type: "set_status", status: "hired" }])).toThrow();
    expect(() => EmailActionsSchema.parse([{ type: "delete_application" }])).toThrow();
    expect(() => EmailActionsSchema.parse([{ type: "add_interview", scheduledAt: "soon" }])).toThrow();
  });
});

describe("loadCandidateApps", () => {
  it("loads only the user's applications with their contact email", async () => {
    const other = await seedUser("ingest-loader-other");
    const [contact] = await db
      .insert(schema.contacts)
      .values({ userId: globalThis.__testUserId, name: "Jane", email: "jane@loader.example" })
      .returning({ id: schema.contacts.id });
    const mine = await insertApp({ company: "Loader Co", companyNormalized: "loader", contactId: contact.id });
    await insertApp({ userId: other.id, company: "Their Co", companyNormalized: "their" });
    const apps = await loadCandidateApps(globalThis.__testUserId);
    expect(apps.find((a) => a.id === mine)).toMatchObject({ company: "Loader Co", contactEmail: "jane@loader.example" });
    expect(apps.find((a) => a.company === "Their Co")).toBeUndefined();
  });
});
