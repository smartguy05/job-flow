import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm-provider", () => ({ transcribe: vi.fn() }));

import { NextRequest } from "next/server";
import { PUT } from "./route";
import { transcribe } from "@/lib/llm-provider";
import { req, anonReq, ctx, insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const mockTranscribe = vi.mocked(transcribe);

async function insertInterview(applicationId: number, userId = globalThis.__testUserId) {
  const [iv] = await db
    .insert(schema.interviews)
    .values({ userId, applicationId, round: "Technical" })
    .returning({ id: schema.interviews.id });
  return iv.id;
}

// Build a multipart NextRequest carrying an audio file (NextRequest derives .cookies from headers).
function multipartReq(url: string, cookie = globalThis.__testCookie ?? "") {
  const form = new FormData();
  form.set("file", new File([new Uint8Array([1, 2, 3])], "interview.m4a", { type: "audio/m4a" }));
  return new NextRequest(`http://localhost${url}`, { method: "PUT", headers: { cookie }, body: form });
}

beforeEach(() => {
  mockTranscribe.mockReset();
  mockTranscribe.mockResolvedValue("Transcribed audio text.");
});

describe("PUT /api/interviews/[id]/transcript", () => {
  it("stores a pasted transcript (JSON body)", async () => {
    const appId = await insertApp();
    const id = await insertInterview(appId);
    const res = await PUT(
      req(`/api/interviews/${id}/transcript`, "PUT", { transcript: "pasted text" }),
      ctx(id),
    );
    expect((await res.json()).transcript).toBe("pasted text");
    const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id));
    expect(iv.transcript).toBe("pasted text");
    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  it("transcribes an uploaded audio file (multipart)", async () => {
    const appId = await insertApp();
    const id = await insertInterview(appId);
    const res = await PUT(multipartReq(`/api/interviews/${id}/transcript`), ctx(id));
    expect((await res.json()).transcript).toBe("Transcribed audio text.");
    expect(mockTranscribe).toHaveBeenCalledOnce();
    const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id));
    expect(iv.transcript).toBe("Transcribed audio text.");
  });

  it("rejects a JSON body without a transcript", async () => {
    const appId = await insertApp();
    const id = await insertInterview(appId);
    const res = await PUT(req(`/api/interviews/${id}/transcript`, "PUT", {}), ctx(id));
    expect(res.status).toBe(400);
  });

  it("returns 404 for another user's interview", async () => {
    const other = await seedUser("other-transcript");
    const appId = await insertApp({ userId: other.id });
    const id = await insertInterview(appId, other.id);
    const res = await PUT(
      req(`/api/interviews/${id}/transcript`, "PUT", { transcript: "x" }),
      ctx(id),
    );
    expect(res.status).toBe(404);
    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await PUT(anonReq(`/api/interviews/1/transcript`, "PUT", { transcript: "x" }), ctx(1));
    expect(res.status).toBe(401);
  });
});
