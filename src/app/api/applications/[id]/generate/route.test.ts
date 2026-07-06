import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/resume-service", () => ({ createResumeForApplication: vi.fn() }));

import { POST } from "./route";
import { createResumeForApplication } from "@/lib/resume-service";
import { req, ctx, insertApp } from "@/test/req";

const mockCreate = vi.mocked(createResumeForApplication);

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockResolvedValue(1);
});

describe("POST /api/applications/[id]/generate", () => {
  it("returns the new resume id", async () => {
    mockCreate.mockResolvedValue(42);
    const id = await insertApp();
    const res = await POST(req(`/api/applications/${id}/generate`, "POST"), ctx(id));
    expect(await res.json()).toEqual({ resumeId: 42 });
    expect(mockCreate).toHaveBeenCalledWith(globalThis.__testUserId, id);
  });

  it("returns a 500 with the error message on failure", async () => {
    mockCreate.mockImplementation(async () => {
      throw new Error("OPENAI_API_KEY is not set");
    });
    const res = await POST(req(`/api/applications/1/generate`, "POST"), ctx(1));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/OPENAI_API_KEY/);
  });
});
