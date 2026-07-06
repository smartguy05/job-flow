import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ generateDebriefQuestions: vi.fn() }));

import { POST } from "./route";
import { generateDebriefQuestions } from "@/lib/llm";
import { req, anonReq, ctx, insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const mockQuestions = vi.mocked(generateDebriefQuestions);

async function insertInterview(applicationId: number, userId = globalThis.__testUserId) {
  const [iv] = await db
    .insert(schema.interviews)
    .values({ userId, applicationId, round: "Technical", transcript: "we discussed X" })
    .returning({ id: schema.interviews.id });
  return iv.id;
}

beforeEach(() => {
  mockQuestions.mockReset();
  mockQuestions.mockResolvedValue(["How did it feel?", "Any red flags?"]);
});

describe("POST /api/interviews/[id]/debrief/questions", () => {
  it("generates and stores debrief questions", async () => {
    const appId = await insertApp();
    const id = await insertInterview(appId);
    const res = await POST(req(`/api/interviews/${id}/debrief/questions`, "POST"), ctx(id));
    expect((await res.json()).questions).toEqual(["How did it feel?", "Any red flags?"]);
    const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id));
    expect(JSON.parse(iv.debriefQuestions)).toEqual(["How did it feel?", "Any red flags?"]);
  });

  it("passes company/role/transcript context to the LLM", async () => {
    const appId = await insertApp({ company: "Initech", roleTitle: "Staff Eng" });
    const id = await insertInterview(appId);
    await POST(req(`/api/interviews/${id}/debrief/questions`, "POST"), ctx(id));
    const arg = mockQuestions.mock.calls[0][0];
    expect(arg.interview.company).toBe("Initech");
    expect(arg.interview.roleTitle).toBe("Staff Eng");
    expect(arg.transcript).toBe("we discussed X");
  });

  it("returns 404 for another user's interview", async () => {
    const other = await seedUser("other-questions");
    const appId = await insertApp({ userId: other.id });
    const id = await insertInterview(appId, other.id);
    const res = await POST(req(`/api/interviews/${id}/debrief/questions`, "POST"), ctx(id));
    expect(res.status).toBe(404);
    expect(mockQuestions).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await POST(anonReq(`/api/interviews/1/debrief/questions`, "POST"), ctx(1));
    expect(res.status).toBe(401);
  });
});
