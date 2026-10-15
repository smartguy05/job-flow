import { describe, it, expect } from "vitest";
import {
  computeAnalytics,
  isResponseEvent,
  percentile,
  SMALL_SAMPLE,
  type AnalyticsApp,
  type AnalyticsInput,
} from "./analytics";

const D = (s: string) => new Date(`${s}T12:00:00Z`);
let nextId = 1;
function app(over: Partial<AnalyticsApp> = {}): AnalyticsApp {
  return {
    id: nextId++,
    status: "applied",
    createdAt: D("2026-01-10"),
    appliedAt: null,
    payMin: null,
    payMax: null,
    sourceChannel: null,
    seniorityLevel: null,
    locationMode: null,
    interestRating: null,
    ...over,
  };
}
const input = (over: Partial<AnalyticsInput>): AnalyticsInput => ({
  apps: [],
  interviews: [],
  resumes: [],
  events: [],
  ...over,
});

describe("percentile", () => {
  it("interpolates linearly and handles edges", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([4], 0.75)).toBe(4);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([4, 1, 3, 2], 0.75)).toBe(3.25);
  });
});

describe("isResponseEvent", () => {
  it("counts status changes, interviews and non-ack emails", () => {
    expect(isResponseEvent({ type: "status_change", detail: "applied → in_progress" })).toBe(true);
    expect(isResponseEvent({ type: "status_change", detail: "applied → closed_lost" })).toBe(true);
    expect(isResponseEvent({ type: "status_change", detail: "in_progress → expired" })).toBe(false);
    expect(isResponseEvent({ type: "status_change", detail: "expired → applied" })).toBe(false);
    expect(isResponseEvent({ type: "interview", detail: "Screen" })).toBe(true);
    expect(isResponseEvent({ type: "email", detail: "Email (rejection): no" })).toBe(true);
    expect(isResponseEvent({ type: "email", detail: "Email (application ack): thanks" })).toBe(false);
    expect(isResponseEvent({ type: "note", detail: "x" })).toBe(false);
    expect(isResponseEvent({ type: "resume_sent", detail: null })).toBe(false);
  });
});

describe("computeAnalytics", () => {
  it("returns zeros and empty breakdowns with no data", () => {
    const a = computeAnalytics(input({}));
    expect(a.total).toBe(0);
    expect(a.responseRate).toBe(0);
    expect(a.funnel.overall.applied).toBe(0);
    expect(a.funnel.overall.responseRate).toBeNull();
    expect(a.funnel.bySource).toEqual([]);
    expect(a.timeToFirstResponse).toEqual({ n: 0, medianDays: null, p75Days: null, smallSample: true });
    expect(a.byResumeVariant).toEqual([]);
  });

  it("buckets byMonth on appliedAt, falling back to createdAt", () => {
    const a = computeAnalytics(
      input({
        apps: [
          app({ createdAt: D("2026-03-01"), appliedAt: D("2026-02-20") }),
          app({ createdAt: D("2026-03-05") }),
        ],
      }),
    );
    expect(a.byMonth).toEqual({ "2026-02": 1, "2026-03": 1 });
  });

  it("treats an interview or a response event as a response even while still 'applied'", () => {
    const viaInterview = app();
    const viaEmail = app();
    const ack = app();
    const a = computeAnalytics(
      input({
        apps: [viaInterview, viaEmail, ack, app()],
        interviews: [{ applicationId: viaInterview.id }],
        events: [
          { applicationId: viaEmail.id, type: "email", detail: "Email (recruiter reply): hi", createdAt: D("2026-01-12") },
          { applicationId: ack.id, type: "email", detail: "Email (application ack)", createdAt: D("2026-01-11") },
        ],
      }),
    );
    expect(a.responseRate).toBeCloseTo(2 / 4, 5);
  });

  it("builds a per-source funnel with step conversion rates", () => {
    const apps = [
      app({ sourceChannel: "linkedin" }),
      app({ sourceChannel: "linkedin", status: "in_progress" }),
      app({ sourceChannel: "linkedin", status: "in_progress" }),
      app({ sourceChannel: "linkedin", status: "closed_won" }),
      app({ sourceChannel: "referral", status: "closed_lost" }),
      app({}),
    ];
    const a = computeAnalytics(
      input({
        apps,
        interviews: [{ applicationId: apps[2].id }, { applicationId: apps[3].id }, { applicationId: apps[3].id }],
      }),
    );
    const li = a.funnel.bySource.find((s) => s.source === "linkedin")!;
    expect(li).toMatchObject({ applied: 4, responded: 3, interviewed: 2, offer: 1, smallSample: true });
    expect(li.responseRate).toBeCloseTo(3 / 4, 5);
    expect(li.interviewConversion).toBeCloseTo(2 / 3, 5);
    expect(li.offerConversion).toBeCloseTo(1 / 2, 5);
    const ref = a.funnel.bySource.find((s) => s.source === "referral")!;
    expect(ref).toMatchObject({ applied: 1, responded: 1, interviewed: 0, offer: 0 });
    expect(ref.offerConversion).toBeNull();
    expect(a.funnel.bySource.find((s) => s.source === "unknown")?.applied).toBe(1);
    // Sorted by volume.
    expect(a.funnel.bySource[0].source).toBe("linkedin");
    expect(a.funnel.overall).toMatchObject({ applied: 6, responded: 4, interviewed: 2, offer: 1 });
  });

  it("counts an offer email as an offer", () => {
    const x = app({ status: "in_progress" });
    const a = computeAnalytics(
      input({ apps: [x], events: [{ applicationId: x.id, type: "email", detail: "Email (offer): yay", createdAt: D("2026-01-20") }] }),
    );
    expect(a.funnel.overall.offer).toBe(1);
  });

  it("computes median and p75 days to the first response after appliedAt", () => {
    const apps = [1, 2, 3, 4, 5].map(() => app({ appliedAt: D("2026-01-01") }));
    const noApplied = app();
    const silent = app({ appliedAt: D("2026-01-01") });
    const events = [
      // pre-application activity is ignored
      { applicationId: apps[0].id, type: "status_change", detail: "applied → in_progress", createdAt: D("2025-12-30") },
      { applicationId: apps[0].id, type: "interview", detail: "Screen", createdAt: D("2026-01-03") },
      { applicationId: apps[0].id, type: "status_change", detail: "applied → in_progress", createdAt: D("2026-01-02") },
      { applicationId: apps[1].id, type: "email", detail: "Email (application ack)", createdAt: D("2026-01-02") },
      { applicationId: apps[1].id, type: "email", detail: "Email (rejection): no", createdAt: D("2026-01-05") },
      { applicationId: apps[2].id, type: "status_change", detail: "applied → closed_lost", createdAt: D("2026-01-11") },
      { applicationId: apps[3].id, type: "interview", detail: "Screen", createdAt: D("2026-01-07") },
      { applicationId: apps[4].id, type: "status_change", detail: "applied → in_progress", createdAt: D("2026-01-21") },
      { applicationId: noApplied.id, type: "interview", detail: "Screen", createdAt: D("2026-01-02") },
      { applicationId: silent.id, type: "note", detail: "x", createdAt: D("2026-01-02") },
    ];
    const a = computeAnalytics(input({ apps: [...apps, noApplied, silent], events }));
    // days: 1, 4, 10, 6, 20 → sorted 1,4,6,10,20
    expect(a.timeToFirstResponse).toEqual({ n: 5, medianDays: 6, p75Days: 10, smallSample: false });
  });

  it("ignores an appliedAt that was backfilled by the response's own status change", () => {
    // Saved without marking applied; moving it to in_progress backfills appliedAt to the
    // moment of the status change, which is not a real application date (0-day "response").
    const changedAt = new Date("2026-02-01T09:00:00.000Z");
    const backfilled = app({ appliedAt: new Date(changedAt.getTime() - 3) });
    const real = app({ appliedAt: D("2026-01-01") });
    const events = [
      { applicationId: backfilled.id, type: "status_change", detail: "applied → in_progress", createdAt: changedAt },
      { applicationId: real.id, type: "status_change", detail: "applied → in_progress", createdAt: D("2026-01-08") },
    ];
    const a = computeAnalytics(input({ apps: [backfilled, real], events }));
    expect(a.timeToFirstResponse).toMatchObject({ n: 1, medianDays: 7 });
    // still counts as a response for the funnel
    expect(a.funnel.overall.responded).toBe(2);
  });

  it("groups response rate by the sent resume's variant label", () => {
    const a1 = app({ status: "in_progress" });
    const a2 = app();
    const a3 = app({ status: "in_progress" });
    const a4 = app();
    const a5 = app({ status: "in_progress" });
    const a = computeAnalytics(
      input({
        apps: [a1, a2, a3, a4, a5],
        resumes: [
          { applicationId: a1.id, sentAt: D("2026-01-02"), variantLabel: "ML-heavy" },
          { applicationId: a2.id, sentAt: D("2026-01-02"), variantLabel: " ML-heavy " },
          // latest sent resume wins
          { applicationId: a3.id, sentAt: D("2026-01-02"), variantLabel: "ML-heavy" },
          { applicationId: a3.id, sentAt: D("2026-01-05"), variantLabel: null },
          // generated but never sent
          { applicationId: a4.id, sentAt: null, variantLabel: "ML-heavy" },
        ],
      }),
    );
    const by = Object.fromEntries(a.byResumeVariant.map((b) => [b.key, b]));
    expect(by["ML-heavy"]).toMatchObject({ n: 2, responded: 1, rate: 0.5, smallSample: true });
    expect(by["unlabeled"]).toMatchObject({ n: 1, responded: 1, rate: 1 });
    expect(by["no resume sent"]).toMatchObject({ n: 2, responded: 1, rate: 0.5 });
  });

  it("groups response rate by seniority, location mode and interest", () => {
    const apps = [
      ...Array.from({ length: 5 }, (_, i) => app({ seniorityLevel: "Senior", locationMode: "remote", interestRating: 5, status: i < 2 ? "in_progress" : "applied" })),
      app({ seniorityLevel: " ", locationMode: "onsite", interestRating: 2 }),
    ];
    const a = computeAnalytics(input({ apps }));
    const sen = Object.fromEntries(a.bySeniority.map((b) => [b.key, b]));
    expect(sen["Senior"]).toMatchObject({ n: 5, responded: 2, rate: 0.4, smallSample: false });
    expect(sen["unspecified"]).toMatchObject({ n: 1, responded: 0, rate: 0, smallSample: true });
    expect(a.byLocationMode.map((b) => b.key)).toEqual(["remote", "onsite"]);
    expect(a.byInterest.map((b) => b.key)).toEqual(["5", "2"]);
    expect(SMALL_SAMPLE).toBe(5);
  });

  it("orders interest buckets high to low with unrated last", () => {
    const a = computeAnalytics(input({ apps: [app({ interestRating: 3 }), app({}), app({ interestRating: 4 })] }));
    expect(a.byInterest.map((b) => b.key)).toEqual(["4", "3", "unrated"]);
  });
});
