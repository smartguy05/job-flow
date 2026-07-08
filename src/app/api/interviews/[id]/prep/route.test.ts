import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ generateInterviewPrep: vi.fn() }));

import { POST, PATCH } from "./route";
import { generateInterviewPrep } from "@/lib/llm";
import { req, anonReq, ctx, insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const mockGen = vi.mocked(generateInterviewPrep);

const PACK = {
  researchBrief: "Globex builds dev tools.",
  likelyQuestions: [{ question: "Hard bug?", category: "behavioral", suggestedAnswer: "STAR" }],
  questionsToAsk: ["What does success look like?"],
  studyChecklist: [{ topic: "System design", priority: "high", why: "Senior" }],
};

async function insertInterview(applicationId: number, userId = globalThis.__testUserId) {
  const [iv] = await db
    .insert(schema.interviews)
    .values({ userId, applicationId, round: "Onsite", interviewer: "Pat" })
    .returning({ id: schema.interviews.id });
  return iv.id;
}

beforeEach(() => {
  mockGen.mockReset();
  mockGen.mockResolvedValue(PACK);
});

describe("POST /api/interviews/[id]/prep", () => {
  it("generates, persists the pack, and logs an event", async () => {
    const appId = await insertApp({ seniorityLevel: "Senior", techStack: "TypeScript", jdSnapshot: "build LLM tools" });
    const id = await insertInterview(appId);
    const res = await POST(req(`/api/interviews/${id}/prep`, "POST"), ctx(id));
    const body = await res.json();
    expect(body.researchBrief).toBe("Globex builds dev tools.");

    const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id));
    expect(JSON.parse(iv.prepPackJson!).questionsToAsk).toHaveLength(1);
    expect(iv.prepGeneratedAt).not.toBeNull();

    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, appId));
    expect(events.some((e) => e.type === "interview_prep")).toBe(true);
  });

  it("passes job level, stack, JD, and round to the generator", async () => {
    const appId = await insertApp({ seniorityLevel: "Staff", techStack: "Go", jdSnapshot: "infra work" });
    const id = await insertInterview(appId);
    await POST(req(`/api/interviews/${id}/prep`, "POST"), ctx(id));
    const arg = mockGen.mock.calls[0][0];
    expect(arg.application.seniorityLevel).toBe("Staff");
    expect(arg.application.techStack).toBe("Go");
    expect(arg.application.jdSnapshot).toBe("infra work");
    expect(arg.interview.round).toBe("Onsite");
  });

  it("falls back to sourceRaw when jdSnapshot is empty", async () => {
    const appId = await insertApp({ jdSnapshot: null, sourceRaw: "raw jd text" });
    const id = await insertInterview(appId);
    await POST(req(`/api/interviews/${id}/prep`, "POST"), ctx(id));
    expect(mockGen.mock.calls[0][0].application.jdSnapshot).toBe("raw jd text");
  });

  it("returns 404 for another user's interview", async () => {
    const other = await seedUser("prep-other");
    const appId = await insertApp({ userId: other.id });
    const id = await insertInterview(appId, other.id);
    const res = await POST(req(`/api/interviews/${id}/prep`, "POST"), ctx(id));
    expect(res.status).toBe(404);
    expect(mockGen).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await POST(anonReq(`/api/interviews/1/prep`, "POST"), ctx(1));
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/interviews/[id]/prep", () => {
  it("persists edits and round-trips the pack", async () => {
    const appId = await insertApp();
    const id = await insertInterview(appId);
    const edited = { ...PACK, researchBrief: "Edited brief" };
    const res = await PATCH(req(`/api/interviews/${id}/prep`, "PATCH", edited), ctx(id));
    expect(res.status).toBe(200);
    const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id));
    expect(JSON.parse(iv.prepPackJson!).researchBrief).toBe("Edited brief");
  });

  it("rejects a malformed pack with 400", async () => {
    const appId = await insertApp();
    const id = await insertInterview(appId);
    const res = await PATCH(req(`/api/interviews/${id}/prep`, "PATCH", { likelyQuestions: "nope" }), ctx(id));
    expect(res.status).toBe(400);
  });

  it("returns 404 for another user's interview", async () => {
    const other = await seedUser("prep-patch-other");
    const appId = await insertApp({ userId: other.id });
    const id = await insertInterview(appId, other.id);
    const res = await PATCH(req(`/api/interviews/${id}/prep`, "PATCH", PACK), ctx(id));
    expect(res.status).toBe(404);
  });
});
