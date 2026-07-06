import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./llm-provider", () => ({ complete: vi.fn() }));

import { complete } from "./llm-provider";
import {
  extractJob,
  generateResumeContent,
  refineResumeContent,
  adjustForLength,
  generateDraft,
  assistCareerProfile,
} from "./llm";
import { makeResumeContent } from "@/test/fixtures";

const mockComplete = vi.mocked(complete);

beforeEach(() => mockComplete.mockReset());

describe("extractJob", () => {
  it("parses a bare JSON object", async () => {
    mockComplete.mockResolvedValue(
      JSON.stringify({
        company: "Globex",
        roleTitle: "AI Engineer",
        link: null,
        jdSnapshot: "build things",
        contactName: "Sarah",
        contactAgency: "TalentBridge",
        contactEmail: null,
      }),
    );
    const r = await extractJob({ userId: globalThis.__testUserId, text: "..." });
    expect(r.company).toBe("Globex");
    expect(r.contactName).toBe("Sarah");
    // JSON-returning calls request json mode
    expect(mockComplete.mock.calls[0][0].json).toBe(true);
  });

  it("parses JSON wrapped in a ```json fence", async () => {
    mockComplete.mockResolvedValue('```json\n{"company":"Initech","roleTitle":"Dev","link":null,"jdSnapshot":"x","contactName":null,"contactAgency":null,"contactEmail":null}\n```');
    const r = await extractJob({ userId: globalThis.__testUserId, text: "..." });
    expect(r.company).toBe("Initech");
  });

  it("throws when the model returns no JSON object", async () => {
    mockComplete.mockResolvedValue("sorry, I cannot help");
    await expect(extractJob({ userId: globalThis.__testUserId, text: "..." })).rejects.toThrow(/No JSON object/);
  });

  it("surfaces the rich detail fields (pay, location, stack, logistics) when present", async () => {
    mockComplete.mockResolvedValue(
      JSON.stringify({
        company: "Globex",
        roleTitle: "Senior AI Engineer",
        link: null,
        jdSnapshot: "build LLM tools",
        contactName: null,
        contactAgency: null,
        contactEmail: null,
        payMin: 180000,
        payMax: 220000,
        payCurrency: "USD",
        payPeriod: "year",
        bonus: "15% target",
        benefits: "health, 401k",
        locationMode: "remote",
        location: "US",
        employmentType: "full-time",
        seniorityLevel: "Senior",
        techStack: "TypeScript, Python",
        companySize: "500-1000",
        companyStage: "Series C",
        industry: "Dev tools",
        sourceChannel: "recruiter",
        datePosted: "2026-07-01",
        applicationDeadline: null,
        postingId: "REQ-123",
        referralName: null,
      }),
    );
    const r = await extractJob({ userId: globalThis.__testUserId, text: "..." });
    expect(r.payMin).toBe(180000);
    expect(r.payMax).toBe(220000);
    expect(r.locationMode).toBe("remote");
    expect(r.techStack).toBe("TypeScript, Python");
    expect(r.postingId).toBe("REQ-123");
    expect(r.bonus).toBe("15% target");
  });
});

describe("generateResumeContent", () => {
  it("returns schema-validated content", async () => {
    mockComplete.mockResolvedValue(JSON.stringify(makeResumeContent()));
    const c = await generateResumeContent(globalThis.__testUserId, { company: "Globex", roleTitle: "AI Eng", jdSnapshot: "jd" });
    expect(c.contact.name).toBe("Anthony James");
    expect(c.jobs.length).toBeGreaterThan(0);
  });

  it("rejects content that fails schema validation", async () => {
    mockComplete.mockResolvedValue(JSON.stringify({ contact: {}, summary: 1 }));
    await expect(
      generateResumeContent(globalThis.__testUserId, { company: "X", roleTitle: "Y", jdSnapshot: "z" }),
    ).rejects.toThrow();
  });
});

describe("refineResumeContent", () => {
  it("passes prior chat as history and returns validated content", async () => {
    mockComplete.mockResolvedValue(JSON.stringify(makeResumeContent({ summary: "refined" })));
    const c = await refineResumeContent({
      userId: globalThis.__testUserId,
      current: makeResumeContent(),
      chat: [{ role: "user", content: "earlier" }, { role: "assistant", content: "ok" }],
      feedback: "lead with AI",
      job: { company: "Globex", roleTitle: "AI Eng", jdSnapshot: "jd" },
    });
    expect(c.summary).toBe("refined");
    const sent = mockComplete.mock.calls[0][0].messages;
    // history (2) + the new feedback message (1)
    expect(sent.length).toBe(3);
    expect(sent[0]).toEqual({ role: "user", content: "earlier" });
  });
});

describe("adjustForLength", () => {
  it("uses expand wording when under length", async () => {
    mockComplete.mockResolvedValue(JSON.stringify(makeResumeContent()));
    await adjustForLength(globalThis.__testUserId, makeResumeContent(), "expand", 1);
    expect(mockComplete.mock.calls[0][0].messages[0].content).toMatch(/exactly 2 full pages/i);
  });
  it("uses condense wording when over length", async () => {
    mockComplete.mockResolvedValue(JSON.stringify(makeResumeContent()));
    await adjustForLength(globalThis.__testUserId, makeResumeContent(), "condense", 3);
    expect(mockComplete.mock.calls[0][0].messages[0].content).toMatch(/must be exactly 2 pages/i);
  });
});

describe("generateDraft", () => {
  it("returns trimmed prose (no json mode)", async () => {
    mockComplete.mockResolvedValue("  Hi Sarah, thanks for reaching out.  ");
    const out = await generateDraft({
      userId: globalThis.__testUserId,
      type: "reply",
      job: { company: "Globex", roleTitle: "AI Eng", jdSnapshot: "jd" },
      contactName: "Sarah",
    });
    expect(out).toBe("Hi Sarah, thanks for reaching out.");
    expect(mockComplete.mock.calls[0][0].json).toBeFalsy();
  });
});

describe("assistCareerProfile", () => {
  it("returns the updated markdown trimmed", async () => {
    mockComplete.mockResolvedValue("# Updated profile\n");
    const out = await assistCareerProfile({ userId: globalThis.__testUserId, current: "# Old", instruction: "add X" });
    expect(out).toBe("# Updated profile");
  });
});
