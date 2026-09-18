import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/resume-service", () => ({ copyResumeToApplication: vi.fn() }));

import { POST } from "./route";
import { copyResumeToApplication } from "@/lib/resume-service";
import { req, anonReq, ctx, insertApp } from "@/test/req";

const mockCopy = vi.mocked(copyResumeToApplication);

beforeEach(() => {
  mockCopy.mockReset();
  mockCopy.mockResolvedValue(7);
});

describe("POST /api/applications/[id]/resumes", () => {
  it("copies the source resume and returns the new resume id", async () => {
    mockCopy.mockResolvedValue(42);
    const id = await insertApp();
    const res = await POST(req(`/api/applications/${id}/resumes`, "POST", { sourceResumeId: 5 }), ctx(id));
    expect(await res.json()).toEqual({ resumeId: 42 });
    expect(mockCopy).toHaveBeenCalledWith(globalThis.__testUserId, 5, id);
  });

  it("400s when sourceResumeId is missing", async () => {
    const id = await insertApp();
    const res = await POST(req(`/api/applications/${id}/resumes`, "POST", {}), ctx(id));
    expect(res.status).toBe(400);
    expect(mockCopy).not.toHaveBeenCalled();
  });

  it("401s without auth", async () => {
    const res = await POST(anonReq("/api/applications/1/resumes", "POST", { sourceResumeId: 5 }), ctx(1));
    expect(res.status).toBe(401);
  });

  it("404s when the source or target is not found", async () => {
    mockCopy.mockImplementation(async () => {
      throw new Error("Resume not found");
    });
    const res = await POST(req("/api/applications/1/resumes", "POST", { sourceResumeId: 5 }), ctx(1));
    expect(res.status).toBe(404);
  });

  it("500s on an unexpected error", async () => {
    mockCopy.mockImplementation(async () => {
      throw new Error("boom");
    });
    const res = await POST(req("/api/applications/1/resumes", "POST", { sourceResumeId: 5 }), ctx(1));
    expect(res.status).toBe(500);
  });
});
