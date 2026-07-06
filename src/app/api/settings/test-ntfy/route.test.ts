import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ntfy", () => ({ sendNtfy: vi.fn() }));

import { POST } from "./route";
import { sendNtfy } from "@/lib/ntfy";
import { req } from "@/test/req";

const mockNtfy = vi.mocked(sendNtfy);

beforeEach(() => mockNtfy.mockReset());

describe("POST /api/settings/test-ntfy", () => {
  it("returns ok:true when the push succeeds", async () => {
    mockNtfy.mockResolvedValue(true);
    expect(await (await POST(req("/api/settings/test-ntfy", "POST"))).json()).toEqual({ ok: true });
  });
  it("returns ok:false when the push fails", async () => {
    mockNtfy.mockResolvedValue(false);
    expect(await (await POST(req("/api/settings/test-ntfy", "POST"))).json()).toEqual({ ok: false });
  });
});
