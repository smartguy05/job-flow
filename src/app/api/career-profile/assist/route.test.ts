import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ assistCareerProfile: vi.fn() }));

import { POST } from "./route";
import { assistCareerProfile } from "@/lib/llm";
import { req } from "@/test/req";

const mockAssist = vi.mocked(assistCareerProfile);

beforeEach(() => {
  mockAssist.mockReset();
  mockAssist.mockResolvedValue("# Updated profile with new details");
});

describe("POST /api/career-profile/assist", () => {
  it("requires an instruction", async () => {
    const res = await POST(req("/api/career-profile/assist", "POST", { instruction: "" }));
    expect(res.status).toBe(400);
  });

  it("returns the proposed markdown without saving it", async () => {
    const res = await POST(req("/api/career-profile/assist", "POST", { instruction: "add the rate-limiter project" }));
    const body = await res.json();
    expect(body.content).toContain("Updated profile");
    expect(mockAssist).toHaveBeenCalledOnce();
  });
});
