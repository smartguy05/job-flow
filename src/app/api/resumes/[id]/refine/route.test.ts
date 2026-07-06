import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ refineResumeContent: vi.fn() }));
vi.mock("@/lib/resume-service", () => ({ rerenderResume: vi.fn() }));

import { POST } from "./route";
import { refineResumeContent } from "@/lib/llm";
import { rerenderResume } from "@/lib/resume-service";
import { req, ctx, insertApp } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { makeResumeContent } from "@/test/fixtures";

const mockRefine = vi.mocked(refineResumeContent);
const mockRerender = vi.mocked(rerenderResume);

async function insertResume(appId: number) {
  const [row] = await db
    .insert(schema.resumes)
    .values({
      userId: globalThis.__testUserId,
      applicationId: appId,
      version: 1,
      status: "draft",
      contentJson: JSON.stringify(makeResumeContent()),
      chatJson: "[]",
    })
    .returning({ id: schema.resumes.id });
  return row.id;
}

beforeEach(() => {
  mockRefine.mockReset();
  mockRerender.mockReset();
  mockRefine.mockResolvedValue(makeResumeContent({ summary: "refined" }));
});

describe("POST /api/resumes/[id]/refine", () => {
  it("requires feedback", async () => {
    const rid = await insertResume(await insertApp());
    const res = await POST(req(`/api/resumes/${rid}/refine`, "POST", { feedback: "" }), ctx(rid));
    expect(res.status).toBe(400);
  });

  it("applies feedback, appends chat, and re-renders", async () => {
    const rid = await insertResume(await insertApp());
    const res = await POST(req(`/api/resumes/${rid}/refine`, "POST", { feedback: "lead with AI" }), ctx(rid));
    expect(res.status).toBe(200);
    expect(mockRefine).toHaveBeenCalledOnce();
    expect(mockRerender).toHaveBeenCalledOnce();
    const [row] = await db.select().from(schema.resumes).where(eq(schema.resumes.id, rid)).limit(1);
    const chat = JSON.parse(row.chatJson);
    expect(chat[0]).toEqual({ role: "user", content: "lead with AI" });
    expect(chat[1].role).toBe("assistant");
  });
});
