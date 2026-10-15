// Outcome analytics: pure aggregation over one user's applications and their activity.
// The loader (`src/lib/services/analytics.ts`) fetches the rows, scoped by userId, and
// this module turns them into the `/api/analytics` response (also the `get_analytics`
// MCP tool). No DB access here so every metric is unit-testable.

/** Buckets with fewer applications than this are flagged `smallSample`. */
export const SMALL_SAMPLE = 5;
const DAY = 24 * 60 * 60 * 1000;

export type AnalyticsApp = {
  id: number;
  status: string;
  createdAt: Date;
  appliedAt: Date | null;
  payMin: number | null;
  payMax: number | null;
  sourceChannel: string | null;
  seniorityLevel: string | null;
  locationMode: string | null;
  interestRating: number | null;
};

export type AnalyticsInput = {
  apps: AnalyticsApp[];
  interviews: { applicationId: number }[];
  resumes: { applicationId: number; sentAt: Date | null; variantLabel: string | null }[];
  /** Activity events (only response-relevant types are needed: status_change, interview, email). */
  events: { applicationId: number; type: string; detail: string | null; createdAt: Date }[];
};

export type FunnelRow = {
  applied: number;
  responded: number;
  interviewed: number;
  offer: number;
  /** responded / applied */
  responseRate: number | null;
  /** interviewed / responded */
  interviewConversion: number | null;
  /** offer / interviewed */
  offerConversion: number | null;
  smallSample: boolean;
};

export type RateBucket = { key: string; n: number; responded: number; rate: number; smallSample: boolean };

export type Analytics = {
  total: number;
  byStatus: Record<string, number>;
  responseRate: number;
  interviewRate: number;
  closedWon: number;
  closedLost: number;
  interviewsScheduled: number;
  resumesGenerated: number;
  resumesSent: number;
  byMonth: Record<string, number>;
  avgBasePay: number | null;
  countsBySource: Record<string, number>;
  funnel: { overall: FunnelRow; bySource: (FunnelRow & { source: string })[] };
  timeToFirstResponse: { n: number; medianDays: number | null; p75Days: number | null; smallSample: boolean };
  byResumeVariant: RateBucket[];
  bySeniority: RateBucket[];
  byLocationMode: RateBucket[];
  byInterest: RateBucket[];
};

export const NO_RESUME_SENT = "no resume sent";
export const UNLABELED = "unlabeled";

/** Linear-interpolated percentile (q in 0..1) of unsorted values; null when empty. */
export function percentile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = (s.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

// An event that shows the employer responded: a status change (except into/out of the
// passive applied/expired states), an interview, or an ingested email other than an
// automated application acknowledgement.
export function isResponseEvent(e: { type: string; detail: string | null }): boolean {
  if (e.type === "interview") return true;
  if (e.type === "status_change") {
    const to = (e.detail ?? "").split("→").pop()?.trim();
    return to !== "applied" && to !== "expired";
  }
  if (e.type === "email") return !(e.detail ?? "").startsWith("Email (application ack)");
  return false;
}

const isOfferEmail = (e: { type: string; detail: string | null }) =>
  e.type === "email" && (e.detail ?? "").startsWith("Email (offer)");

const ratio = (num: number, den: number) => (den ? num / den : null);

function funnelRow(apps: AnalyticsApp[], responded: Set<number>, interviewed: Set<number>, offered: Set<number>): FunnelRow {
  const r = apps.filter((a) => responded.has(a.id)).length;
  const i = apps.filter((a) => interviewed.has(a.id)).length;
  const o = apps.filter((a) => offered.has(a.id)).length;
  return {
    applied: apps.length,
    responded: r,
    interviewed: i,
    offer: o,
    responseRate: ratio(r, apps.length),
    interviewConversion: ratio(i, r),
    offerConversion: ratio(o, i),
    smallSample: apps.length < SMALL_SAMPLE,
  };
}

function rateBuckets(
  apps: AnalyticsApp[],
  responded: Set<number>,
  keyOf: (a: AnalyticsApp) => string,
  order?: (a: string, b: string) => number,
): RateBucket[] {
  const groups = new Map<string, { n: number; responded: number }>();
  for (const a of apps) {
    const k = keyOf(a);
    const g = groups.get(k) ?? { n: 0, responded: 0 };
    g.n++;
    if (responded.has(a.id)) g.responded++;
    groups.set(k, g);
  }
  const rows = [...groups].map(([key, g]) => ({
    key,
    n: g.n,
    responded: g.responded,
    rate: g.responded / g.n,
    smallSample: g.n < SMALL_SAMPLE,
  }));
  return rows.sort(order ? (x, y) => order(x.key, y.key) : (x, y) => y.n - x.n || x.key.localeCompare(y.key));
}

const label = (v: string | null | undefined, fallback: string) => v?.trim() || fallback;

export function computeAnalytics({ apps, interviews, resumes, events }: AnalyticsInput): Analytics {
  const total = apps.length;
  const byStatus: Record<string, number> = {};
  for (const a of apps) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;

  const interviewed = new Set(interviews.map((i) => i.applicationId));
  const responseEvents = events.filter(isResponseEvent);

  // An application "responded" once it moved past applied (expired doesn't count — it died
  // without progressing), had an interview, or logged a response event.
  const responded = new Set<number>();
  for (const a of apps) if (a.status !== "applied" && a.status !== "expired") responded.add(a.id);
  for (const id of interviewed) responded.add(id);
  for (const e of responseEvents) responded.add(e.applicationId);

  const offered = new Set<number>();
  for (const a of apps) if (a.status === "closed_won") offered.add(a.id);
  for (const e of events) if (isOfferEmail(e)) offered.add(e.applicationId);

  const respondedCount = apps.filter((a) => responded.has(a.id)).length;
  const interviewedCount = apps.filter((a) => interviewed.has(a.id)).length;

  // Applications per month, by when they were applied to (falling back to capture date).
  const byMonth: Record<string, number> = {};
  for (const a of apps) {
    const key = (a.appliedAt ?? a.createdAt).toISOString().slice(0, 7);
    byMonth[key] = (byMonth[key] ?? 0) + 1;
  }

  // Average base pay from the midpoint of each range that has pay data.
  const midpoints = apps
    .filter((a) => a.payMin != null || a.payMax != null)
    .map((a) => ((a.payMin ?? a.payMax!) + (a.payMax ?? a.payMin!)) / 2);
  const avgBasePay = midpoints.length ? Math.round(midpoints.reduce((s, v) => s + v, 0) / midpoints.length) : null;

  const countsBySource: Record<string, number> = {};
  for (const a of apps) {
    if (a.sourceChannel) countsBySource[a.sourceChannel] = (countsBySource[a.sourceChannel] ?? 0) + 1;
  }

  // Funnel by source channel.
  const bySourceApps = new Map<string, AnalyticsApp[]>();
  for (const a of apps) {
    const k = label(a.sourceChannel, "unknown");
    bySourceApps.set(k, [...(bySourceApps.get(k) ?? []), a]);
  }
  const bySource = [...bySourceApps]
    .map(([source, list]) => ({ source, ...funnelRow(list, responded, interviewed, offered) }))
    .sort((x, y) => y.applied - x.applied || x.source.localeCompare(y.source));

  // Time to first response: days from appliedAt to the first response event at/after it.
  const appliedAt = new Map(apps.map((a) => [a.id, a.appliedAt]));
  const firstResponse = new Map<number, number>();
  for (const e of responseEvents) {
    const t = e.createdAt.getTime();
    const prev = firstResponse.get(e.applicationId);
    const applied = appliedAt.get(e.applicationId);
    if (!applied || t < applied.getTime()) continue;
    if (prev == null || t < prev) firstResponse.set(e.applicationId, t);
  }
  const days = apps
    .filter((a) => a.appliedAt && firstResponse.has(a.id))
    .map((a) => (firstResponse.get(a.id)! - a.appliedAt!.getTime()) / DAY);
  const round1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

  // Resume variant: the most recently *sent* resume per application.
  const sentVariant = new Map<number, { at: number; label: string }>();
  for (const r of resumes) {
    if (!r.sentAt) continue;
    const prev = sentVariant.get(r.applicationId);
    if (!prev || r.sentAt.getTime() > prev.at) {
      sentVariant.set(r.applicationId, { at: r.sentAt.getTime(), label: label(r.variantLabel, UNLABELED) });
    }
  }

  const interestKey = (a: AnalyticsApp) => (a.interestRating != null ? String(a.interestRating) : "unrated");
  const interestOrder = (x: string, y: string) =>
    (y === "unrated" ? -1 : Number(y)) - (x === "unrated" ? -1 : Number(x));

  return {
    total,
    byStatus,
    responseRate: total ? respondedCount / total : 0,
    interviewRate: total ? interviewedCount / total : 0,
    closedWon: byStatus["closed_won"] ?? 0,
    closedLost: byStatus["closed_lost"] ?? 0,
    interviewsScheduled: interviews.length,
    resumesGenerated: resumes.length,
    resumesSent: resumes.filter((r) => r.sentAt).length,
    byMonth,
    avgBasePay,
    countsBySource,
    funnel: { overall: funnelRow(apps, responded, interviewed, offered), bySource },
    timeToFirstResponse: {
      n: days.length,
      medianDays: round1(percentile(days, 0.5)),
      p75Days: round1(percentile(days, 0.75)),
      smallSample: days.length < SMALL_SAMPLE,
    },
    byResumeVariant: rateBuckets(apps, responded, (a) => sentVariant.get(a.id)?.label ?? NO_RESUME_SENT),
    bySeniority: rateBuckets(apps, responded, (a) => label(a.seniorityLevel, "unspecified")),
    byLocationMode: rateBuckets(apps, responded, (a) => label(a.locationMode, "unspecified")),
    byInterest: rateBuckets(apps, responded, interestKey, interestOrder),
  };
}
