import { describe, it, expect, vi } from "vitest";
import { statusColor, fmtDate, fmtRelative, STATUS_LABELS, api, toDateTimeLocal, fromDateTimeLocal } from "./ui";

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

describe("fromDateTimeLocal", () => {
  it("returns null for an empty string", () => {
    expect(fromDateTimeLocal("")).toBeNull();
  });
  it("produces a UTC ISO instant", () => {
    const iso = fromDateTimeLocal("2026-07-08T14:30");
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
  it("interprets the naive string in the local zone, not UTC", () => {
    // Whatever the runner's timezone is, reading the instant back with local
    // getters must recover the same wall-clock the user typed. (If it were
    // parsed as UTC, this would fail in any non-UTC zone.)
    const d = new Date(fromDateTimeLocal("2026-07-08T14:30")!);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // July (0-indexed)
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });
  it("round-trips with toDateTimeLocal (regression guard for the time-shift bug)", () => {
    const picked = "2026-07-08T14:30";
    expect(toDateTimeLocal(fromDateTimeLocal(picked))).toBe(picked);
  });
});

describe("toDateTimeLocal", () => {
  it("returns an empty string for null", () => {
    expect(toDateTimeLocal(null)).toBe("");
  });
  it("returns an empty string for an unparseable value", () => {
    expect(toDateTimeLocal("not-a-date")).toBe("");
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
