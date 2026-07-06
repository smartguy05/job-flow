import { describe, it, expect, vi } from "vitest";
import { statusColor, fmtDate, fmtRelative, STATUS_LABELS, api } from "./ui";

describe("statusColor", () => {
  it("maps known statuses to distinct colors", () => {
    expect(statusColor("applied").fg).not.toBe(statusColor("closed_lost").fg);
  });
  it("falls back for unknown statuses", () => {
    expect(statusColor("weird")).toBeTruthy();
  });
});

describe("STATUS_LABELS", () => {
  it("has a human label for each pipeline status", () => {
    expect(STATUS_LABELS.applied).toBe("Applied");
    expect(STATUS_LABELS.closed_won).toContain("Won");
  });
});

describe("fmtDate / fmtRelative", () => {
  it("renders a dash for null", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtRelative(null)).toBe("—");
  });
  it("says 'today' for now and 'yesterday' for a day ago", () => {
    expect(fmtRelative(new Date())).toBe("today");
    expect(fmtRelative(new Date(Date.now() - 24 * 60 * 60 * 1000))).toBe("yesterday");
  });
  it("uses Nd ago within the month", () => {
    expect(fmtRelative(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000))).toBe("5d ago");
  });
});

describe("api", () => {
  it("returns parsed JSON on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ a: 1 }), { status: 200 }));
    await expect(api("/x")).resolves.toEqual({ a: 1 });
    vi.restoreAllMocks();
  });
  it("throws the server error message on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
    await expect(api("/x")).rejects.toThrow("boom");
    vi.restoreAllMocks();
  });
});
