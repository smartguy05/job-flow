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
  generateDebriefQuestions,
  synthesizeDebrief,
  generateInterviewPrep,
  generateOfferComparison,
} from "./llm";
import { makeResumeContent } from "@/test/fixtures";
import type { ComparableApp } from "./offer-comparison";

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

const INTERVIEW = { company: "Globex", roleTitle: "AI Engineer", round: "Onsite", interviewer: "Pat" };

describe("generateDebriefQuestions", () => {
  it("parses questions from a JSON object", async () => {
    mockComplete.mockResolvedValue(JSON.stringify({ questions: ["How did it go?", "Red flags?"] }));
    const out = await generateDebriefQuestions({
      userId: globalThis.__testUserId,
      interview: INTERVIEW,
      transcript: "we talked about systems design",
    });
    expect(out).toEqual(["How did it go?", "Red flags?"]);
  });

  it("tolerates a fenced code block", async () => {
    mockComplete.mockResolvedValue('```json\n{"questions": ["Q1"]}\n```');
    const out = await generateDebriefQuestions({ userId: globalThis.__testUserId, interview: INTERVIEW });
    expect(out).toEqual(["Q1"]);
  });
});

describe("synthesizeDebrief", () => {
  it("parses the summary, action items, and sentiment", async () => {
    mockComplete.mockResolvedValue(
      JSON.stringify({
        summary: "Solid round.",
        actionItems: ["Follow up with recruiter"],
        sentiment: { fit: "strong", greenFlags: ["good team"], redFlags: [], rationale: "aligned" },
      }),
    );
    const out = await synthesizeDebrief({
      userId: globalThis.__testUserId,
      interview: INTERVIEW,
      transcript: "transcript",
      questions: ["Q1"],
      answers: ["A1"],
    });
    expect(out.summary).toBe("Solid round.");
    expect(out.actionItems).toEqual(["Follow up with recruiter"]);
    expect(out.sentiment.fit).toBe("strong");
  });
});

describe("generateInterviewPrep", () => {
  const PACK = {
    researchBrief: "Globex builds dev tools.",
    likelyQuestions: [{ question: "Tell me about a hard bug", category: "behavioral", suggestedAnswer: "STAR..." }],
    questionsToAsk: ["What does success look like in 90 days?"],
    studyChecklist: [{ topic: "System design", priority: "high", why: "Senior role" }],
  };

  it("returns a schema-validated pack and passes JD/level/round to the model", async () => {
    mockComplete.mockResolvedValue(JSON.stringify(PACK));
    const out = await generateInterviewPrep({
      userId: globalThis.__testUserId,
      application: { company: "Globex", roleTitle: "AI Engineer", jdSnapshot: "build LLM tools", seniorityLevel: "Senior", techStack: "TypeScript" },
      interview: { round: "Onsite", interviewer: "Pat" },
    });
    expect(out.researchBrief).toBe("Globex builds dev tools.");
    expect(out.likelyQuestions[0].category).toBe("behavioral");
    const content = mockComplete.mock.calls[0][0].messages[0].content;
    expect(content).toMatch(/Senior/);
    expect(content).toMatch(/Onsite/);
    expect(content).toMatch(/build LLM tools/);
    expect(mockComplete.mock.calls[0][0].json).toBe(true);
  });

  it("rejects a malformed pack", async () => {
    mockComplete.mockResolvedValue(JSON.stringify({ likelyQuestions: "nope" }));
    await expect(
      generateInterviewPrep({
        userId: globalThis.__testUserId,
        application: { company: "X", roleTitle: "Y", jdSnapshot: "z" },
        interview: {},
      }),
    ).rejects.toThrow();
  });
});

describe("generateOfferComparison", () => {
  const VERDICT = {
    summary: "Globex edges ahead.",
    recommendation: { applicationId: 1, rationale: "Better comp and fit" },
    ranking: [
      { applicationId: 1, rank: 1, rationale: "Higher pay" },
      { applicationId: 2, rank: 2, rationale: "Lower pay" },
    ],
    factors: [{ name: "Compensation", notes: "1 pays more" }],
    risks: ["1 is earlier stage"],
  };
  const app = (over: Partial<ComparableApp>): ComparableApp => ({
    id: 1, company: "Globex", roleTitle: "AI Engineer", payMin: 200000, payMax: 200000,
    payCurrency: "USD", payPeriod: "year", bonus: null, benefits: null, locationMode: "remote",
    location: null, employmentType: "full-time", seniorityLevel: "Senior", techStack: "TS",
    companySize: null, companyStage: null, industry: null, interestRating: 4, pros: "team", cons: null,
    ...over,
  });

  it("returns a schema-validated verdict and lists applicationIds in the prompt", async () => {
    mockComplete.mockResolvedValue(JSON.stringify(VERDICT));
    const out = await generateOfferComparison({
      userId: globalThis.__testUserId,
      applications: [app({ id: 1 }), app({ id: 2, company: "Initech" })],
    });
    expect(out.recommendation.applicationId).toBe(1);
    expect(out.ranking).toHaveLength(2);
    const content = mockComplete.mock.calls[0][0].messages[0].content;
    expect(content).toMatch(/applicationId 1/);
    expect(content).toMatch(/applicationId 2/);
  });

  it("passes benefits documents through to complete and mentions priorities", async () => {
    mockComplete.mockResolvedValue(JSON.stringify(VERDICT));
    await generateOfferComparison({
      userId: globalThis.__testUserId,
      applications: [app({ id: 1 }), app({ id: 2 })],
      priorities: "remote first",
      benefitsDocs: [{ name: "b.pdf", mediaType: "application/pdf", data: "QkFTRTY0" }],
    });
    const opts = mockComplete.mock.calls[0][0];
    expect(opts.documents).toHaveLength(1);
    expect(opts.documents![0].name).toBe("b.pdf");
    expect(opts.messages[0].content).toMatch(/remote first/);
  });
});
