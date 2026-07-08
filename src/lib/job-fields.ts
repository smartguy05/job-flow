// Shared, client-safe descriptors for the optional job-detail fields.
// Used by the capture review screen and the application detail page.

export type JobDetails = {
  payMin: number | null;
  payMax: number | null;
  payCurrency: string | null;
  payPeriod: string | null;
  bonus: string | null;
  benefits: string | null;
  locationMode: string | null;
  location: string | null;
  employmentType: string | null;
  seniorityLevel: string | null;
  techStack: string | null;
  companySize: string | null;
  companyStage: string | null;
  industry: string | null;
  sourceChannel: string | null;
  appliedAt: string | null;
  datePosted: string | null;
  applicationDeadline: string | null;
  postingId: string | null;
  referralName: string | null;
  interestRating: number | null;
  pros: string | null;
  cons: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
};

export const LOCATION_MODES = ["remote", "hybrid", "onsite"];
export const EMPLOYMENT_TYPES = ["full-time", "contract", "contract-to-hire", "part-time"];
export const PAY_PERIODS = ["year", "hour"];

// The fields the job-details form owns. Anything else on an application detail
// object (notes, jdSnapshot, company, status, contact, …) belongs to a different
// editor and must not be echoed back by this form.
export const JOB_DETAIL_KEYS: (keyof JobDetails)[] = [
  "payMin", "payMax", "payCurrency", "payPeriod", "bonus", "benefits", "locationMode",
  "location", "employmentType", "seniorityLevel", "techStack", "companySize", "companyStage",
  "industry", "sourceChannel", "appliedAt", "datePosted", "applicationDeadline", "postingId",
  "referralName", "interestRating", "pros", "cons", "nextAction", "nextActionDate",
];

// Returns only the JobDetails keys present in `source`, so the details form never
// submits (and clobbers) columns it doesn't own. An explicit `null` is preserved
// (a field can still be cleared); an absent key is omitted, not set to `undefined`.
export function pickJobDetails(source: Record<string, unknown>): Partial<JobDetails> {
  const out: Partial<JobDetails> = {};
  for (const k of JOB_DETAIL_KEYS) {
    if (k in source && source[k] !== undefined) {
      (out as Record<string, unknown>)[k] = source[k];
    }
  }
  return out;
}

export function formatPay(d: {
  payMin?: number | null;
  payMax?: number | null;
  payCurrency?: string | null;
  payPeriod?: string | null;
}): string | null {
  if (d.payMin == null && d.payMax == null) return null;
  const cur = d.payCurrency || "USD";
  const per = d.payPeriod === "hour" ? "/hr" : "/yr";
  const fmt = (n: number) => (d.payPeriod === "hour" ? `$${n}` : `$${Math.round(n / 1000)}k`);
  if (d.payMin != null && d.payMax != null && d.payMin !== d.payMax) {
    return `${fmt(d.payMin)}–${fmt(d.payMax)}${per} ${cur}`;
  }
  return `${fmt((d.payMin ?? d.payMax)!)}${per} ${cur}`;
}
