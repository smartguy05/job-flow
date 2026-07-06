import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/resume-service", () => ({ rerenderResume: vi.fn() }));

import { GET, PATCH } from "./route";
import { rerenderResume } from "@/lib/resume-service";
import { req, anonReq, ctx, insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { makeResumeContent } from "@/test/fixtures";

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
      pageCount: 2,
    })
    .returning({ id: schema.resumes.id });
  return row.id;
}

beforeEach(() => mockRerender.mockReset());

describe("GET /api/resumes/[id]", () => {
  it("returns parsed content and chat", async () => {
    const rid = await insertResume(await insertApp());
    const res = await GET(req(`/api/resumes/${rid}`), ctx(rid));
    const body = await res.json();
    expect(body.content.contact.name).toBe("Anthony James");
    expect(Array.isArray(body.chat)).toBe(true);
  });

  it("404s for a missing resume", async () => {
    const res = await GET(req("/api/resumes/999"), ctx(999));
    expect(res.status).toBe(404);
  });

  it("401s without auth", async () => {
    const res = await GET(anonReq("/api/resumes/1"), ctx(1));
    expect(res.status).toBe(401);
  });

  it("404s for another tenant's resume", async () => {
    const rid = await insertResume(await insertApp());
    const other = await seedUser("resume-other");
    const res = await GET(other.req(`/api/resumes/${rid}`), ctx(rid));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/resumes/[id]", () => {
  it("marks a resume sent (sets sentAt + final) and logs the event", async () => {
    const appId = await insertApp();
    const rid = await insertResume(appId);
    const res = await PATCH(req(`/api/resumes/${rid}`, "PATCH", { markSent: true }), ctx(rid));
    const body = await res.json();
    expect(body.sentAt).not.toBeNull();
    expect(body.status).toBe("final");
    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, appId));
    expect(events.some((e) => e.type === "resume_sent")).toBe(true);
  });

  it("re-renders when new content is supplied", async () => {
    const rid = await insertResume(await insertApp());
    const res = await PATCH(req(`/api/resumes/${rid}`, "PATCH", { content: makeResumeContent({ summary: "edited" }) }), ctx(rid));
    expect(res.status).toBe(200);
    expect(mockRerender).toHaveBeenCalledOnce();
  });

  it("rejects invalid content with a 500", async () => {
    const rid = await insertResume(await insertApp());
    const res = await PATCH(req(`/api/resumes/${rid}`, "PATCH", { content: { bogus: true } }), ctx(rid));
    expect(res.status).toBe(500);
    expect(mockRerender).not.toHaveBeenCalled();
  });
});
