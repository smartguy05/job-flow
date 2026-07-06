import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ extractJob: vi.fn() }));

import { POST } from "./route";
import { extractJob } from "@/lib/llm";
import { req, insertApp } from "@/test/req";
import { normalizeCompany } from "@/lib/dedup";

const mockExtract = vi.mocked(extractJob);

beforeEach(() => {
  mockExtract.mockReset();
  mockExtract.mockResolvedValue({
    company: "Globex Corp",
    roleTitle: "Senior AI Engineer",
    link: null,
    jdSnapshot: "build LLM tools",
    contactName: "Sarah",
    contactAgency: "TalentBridge",
    contactEmail: null,
  });
});

describe("POST /api/capture", () => {
  it("returns 400 when text is empty", async () => {
    const res = await POST(req("/api/capture", "POST", { text: "  " }));
    expect(res.status).toBe(400);
  });

  it("returns extracted fields and an empty duplicate list when none exist", async () => {
    const res = await POST(req("/api/capture", "POST", { text: "some recruiter message" }));
    const body = await res.json();
    expect(body.extracted.company).toBe("Globex Corp");
    expect(body.duplicates).toEqual([]);
    expect(body.dedupWindowDays).toBe(30);
  });

  it("passes through the rich detail fields from extraction", async () => {
    mockExtract.mockResolvedValue({
      company: "Globex Corp",
      roleTitle: "Senior AI Engineer",
      link: null,
      jdSnapshot: "x",
      contactName: null,
      contactAgency: null,
      contactEmail: null,
      payMin: 180000,
      payMax: 220000,
      payCurrency: "USD",
      payPeriod: "year",
      bonus: null,
      benefits: null,
      locationMode: "remote",
      location: "US",
      employmentType: "full-time",
      seniorityLevel: "Senior",
      techStack: "TypeScript",
      companySize: null,
      companyStage: null,
      industry: null,
      sourceChannel: "recruiter",
      datePosted: null,
      applicationDeadline: null,
      postingId: null,
      referralName: null,
    });
    const res = await POST(req("/api/capture", "POST", { text: "msg" }));
    const body = await res.json();
    expect(body.extracted.payMin).toBe(180000);
    expect(body.extracted.locationMode).toBe("remote");
    expect(body.extracted.techStack).toBe("TypeScript");
  });

  it("flags a prior application to the same company + similar role", async () => {
    await insertApp({ company: "Globex Corporation", companyNormalized: normalizeCompany("Globex Corporation"), roleTitle: "Sr. Software Developer" });
    // extract resolves to Globex Corp / Senior Software Engineer-ish
    mockExtract.mockResolvedValue({
      company: "Globex Corp",
      roleTitle: "Senior Software Engineer",
      link: null,
      jdSnapshot: "x",
      contactName: null,
      contactAgency: null,
      contactEmail: null,
    });
    const res = await POST(req("/api/capture", "POST", { text: "msg" }));
    const body = await res.json();
    expect(body.duplicates.length).toBeGreaterThanOrEqual(1);
  });

  it("propagates a clean 500 when extraction fails", async () => {
    mockExtract.mockImplementation(async () => {
      throw new Error("OPENAI_API_KEY is not set");
    });
    const res = await POST(req("/api/capture", "POST", { text: "msg" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/OPENAI_API_KEY/);
  });
});
