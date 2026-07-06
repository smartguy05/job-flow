import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ synthesizeDebrief: vi.fn() }));

import { POST } from "./route";
import { synthesizeDebrief } from "@/lib/llm";
import { req, anonReq, ctx, insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const mockSynth = vi.mocked(synthesizeDebrief);

const SYNTHESIS = {
  summary: "Went well overall.",
  actionItems: ["Send thank-you note", "Research their tech stack"],
  sentiment: { fit: "strong" as const, greenFlags: ["Great team"], redFlags: [], rationale: "Aligned" },
};

async function insertInterview(applicationId: number, userId = globalThis.__testUserId) {
  const [iv] = await db
    .insert(schema.interviews)
    .values({
      userId,
      applicationId,
      round: "Onsite",
      transcript: "transcript text",
      debriefQuestions: JSON.stringify(["Q1", "Q2"]),
    })
    .returning({ id: schema.interviews.id });
  return iv.id;
}

beforeEach(() => {
  mockSynth.mockReset();
  mockSynth.mockResolvedValue(SYNTHESIS);
});

describe("POST /api/interviews/[id]/debrief", () => {
  it("stores answers + synthesis and logs an event", async () => {
    const appId = await insertApp();
    const id = await insertInterview(appId);
    const res = await POST(
      req(`/api/interviews/${id}/debrief`, "POST", { answers: ["a1", "a2"] }),
      ctx(id),
    );
    const body = await res.json();
    expect(body.summary).toBe("Went well overall.");
    expect(body.actionItems).toHaveLength(2);

    const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id));
    expect(JSON.parse(iv.debriefAnswers)).toEqual(["a1", "a2"]);
    expect(iv.debriefSummary).toBe("Went well overall.");
    expect(JSON.parse(iv.debriefActionItems)).toContain("Send thank-you note");
    expect(JSON.parse(iv.debriefSentiment!).fit).toBe("strong");
    expect(iv.debriefAt).not.toBeNull();

    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, appId));
    expect(events.some((e) => e.type === "interview" && e.detail === "Debrief completed")).toBe(true);
  });

  it("passes the stored questions and provided answers to the LLM", async () => {
    const appId = await insertApp();
    const id = await insertInterview(appId);
    await POST(req(`/api/interviews/${id}/debrief`, "POST", { answers: ["x", "y"] }), ctx(id));
    const arg = mockSynth.mock.calls[0][0];
    expect(arg.questions).toEqual(["Q1", "Q2"]);
    expect(arg.answers).toEqual(["x", "y"]);
  });

  it("returns 404 for another user's interview", async () => {
    const other = await seedUser("other-debrief");
    const appId = await insertApp({ userId: other.id });
    const id = await insertInterview(appId, other.id);
    const res = await POST(req(`/api/interviews/${id}/debrief`, "POST", { answers: [] }), ctx(id));
    expect(res.status).toBe(404);
    expect(mockSynth).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await POST(anonReq(`/api/interviews/1/debrief`, "POST", { answers: [] }), ctx(1));
    expect(res.status).toBe(401);
  });
});
