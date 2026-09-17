import { describe, it, expect } from "vitest";
import { filterApplications, HIDDEN_STATUSES, type DashboardFilter } from "./dashboard-filter";

type Row = {
  id: number;
  status: string;
  company: string;
  roleTitle: string;
  appliedAt: string | null;
  lastActivityAt: string;
  interestRating: number | null;
};

function row(id: number, over: Partial<Row> = {}): Row {
  return {
    id,
    status: "applied",
    company: "Acme",
    roleTitle: "Engineer",
    appliedAt: "2026-01-10T00:00:00.000Z",
    lastActivityAt: "2026-01-10T00:00:00.000Z",
    interestRating: null,
    ...over,
  };
}

const base: DashboardFilter = { status: "all", query: "", includeClosed: false, sort: "activity" };

const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("filterApplications", () => {
  it("hides expired and closed statuses by default", () => {
    const apps = [
      row(1, { status: "applied" }),
      row(2, { status: "in_progress" }),
      row(3, { status: "expired" }),
      row(4, { status: "closed_won" }),
      row(5, { status: "closed_lost" }),
    ];
    expect(ids(filterApplications(apps, base)).sort()).toEqual([1, 2]);
  });

  it("HIDDEN_STATUSES is the terminal set", () => {
    expect([...HIDDEN_STATUSES].sort()).toEqual(["closed_lost", "closed_won", "expired"]);
  });

  it("reveals hidden statuses when includeClosed is true", () => {
    const apps = [
      row(1, { status: "applied" }),
      row(3, { status: "expired" }),
      row(4, { status: "closed_won" }),
    ];
    expect(ids(filterApplications(apps, { ...base, includeClosed: true })).sort()).toEqual([1, 3, 4]);
  });

  it("shows a hidden status when explicitly selected, even with toggle off", () => {
    const apps = [
      row(1, { status: "applied" }),
      row(3, { status: "expired" }),
      row(4, { status: "closed_won" }),
    ];
    expect(ids(filterApplications(apps, { ...base, status: "expired" }))).toEqual([3]);
    expect(ids(filterApplications(apps, { ...base, status: "closed_won" }))).toEqual([4]);
  });

  it("filters by a specific non-hidden status", () => {
    const apps = [row(1, { status: "applied" }), row(2, { status: "in_progress" })];
    expect(ids(filterApplications(apps, { ...base, status: "in_progress" }))).toEqual([2]);
  });

  it("matches query against company and role, case-insensitively", () => {
    const apps = [
      row(1, { company: "Globex", roleTitle: "Backend Engineer" }),
      row(2, { company: "Acme", roleTitle: "Designer" }),
    ];
    expect(ids(filterApplications(apps, { ...base, query: "globex" }))).toEqual([1]);
    expect(ids(filterApplications(apps, { ...base, query: "designer" }))).toEqual([2]);
    expect(ids(filterApplications(apps, { ...base, query: "engineer" }))).toEqual([1]);
  });

  it("applies an inclusive date range on appliedAt", () => {
    const apps = [
      row(1, { appliedAt: "2026-01-01T00:00:00.000Z" }),
      row(2, { appliedAt: "2026-02-15T00:00:00.000Z" }),
      row(3, { appliedAt: "2026-03-20T00:00:00.000Z" }),
    ];
    const f = { ...base, from: "2026-02-01", to: "2026-02-28" };
    expect(ids(filterApplications(apps, f))).toEqual([2]);
  });

  it("includes rows on the exact range boundaries", () => {
    const apps = [
      row(1, { appliedAt: "2026-02-01T09:00:00.000Z" }),
      row(2, { appliedAt: "2026-02-28T23:00:00.000Z" }),
    ];
    const f = { ...base, from: "2026-02-01", to: "2026-02-28" };
    expect(ids(filterApplications(apps, f)).sort()).toEqual([1, 2]);
  });

  it("excludes rows with null appliedAt only when a range is active", () => {
    const apps = [row(1, { appliedAt: null }), row(2, { appliedAt: "2026-02-10T00:00:00.000Z" })];
    expect(ids(filterApplications(apps, base)).sort()).toEqual([1, 2]);
    expect(ids(filterApplications(apps, { ...base, from: "2026-01-01" }))).toEqual([2]);
    expect(ids(filterApplications(apps, { ...base, to: "2026-12-31" }))).toEqual([2]);
  });

  it("sorts by activity desc by default", () => {
    const apps = [
      row(1, { lastActivityAt: "2026-01-01T00:00:00.000Z" }),
      row(2, { lastActivityAt: "2026-03-01T00:00:00.000Z" }),
      row(3, { lastActivityAt: "2026-02-01T00:00:00.000Z" }),
    ];
    expect(ids(filterApplications(apps, base))).toEqual([2, 3, 1]);
  });

  it("sorts by applied date desc, nulls last", () => {
    const apps = [
      row(1, { appliedAt: "2026-01-01T00:00:00.000Z" }),
      row(2, { appliedAt: null }),
      row(3, { appliedAt: "2026-03-01T00:00:00.000Z" }),
    ];
    expect(ids(filterApplications(apps, { ...base, sort: "applied" }))).toEqual([3, 1, 2]);
  });

  it("sorts by company A–Z, case-insensitive, blank last", () => {
    const apps = [
      row(1, { company: "banana" }),
      row(2, { company: "Apple" }),
      row(3, { company: "" }),
      row(4, { company: "cherry" }),
    ];
    expect(ids(filterApplications(apps, { ...base, sort: "company" }))).toEqual([2, 1, 4, 3]);
  });

  it("sorts by interest desc, nulls last", () => {
    const apps = [
      row(1, { interestRating: 3 }),
      row(2, { interestRating: null }),
      row(3, { interestRating: 5 }),
      row(4, { interestRating: 1 }),
    ];
    expect(ids(filterApplications(apps, { ...base, sort: "interest" }))).toEqual([3, 1, 4, 2]);
  });

  it("does not mutate the input array", () => {
    const apps = [row(2, { lastActivityAt: "2026-01-01T00:00:00.000Z" }), row(1, { lastActivityAt: "2026-03-01T00:00:00.000Z" })];
    const before = ids(apps);
    filterApplications(apps, base);
    expect(ids(apps)).toEqual(before);
  });
});
