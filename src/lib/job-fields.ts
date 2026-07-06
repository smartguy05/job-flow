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
