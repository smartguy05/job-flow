import { formatPay } from "./job-fields";

// The subset of application fields the offer comparison reads. Populated directly from the
// applications table (see the /api/offers/comparisons route).
export type ComparableApp = {
  id: number;
  company: string;
  roleTitle: string;
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
  interestRating: number | null;
  pros: string | null;
  cons: string | null;
};

export type OfferTableRow = { label: string; values: (string | null)[] };
export type OfferTable = {
  applications: { id: number; company: string; roleTitle: string }[];
  rows: OfferTableRow[];
};

function location(a: ComparableApp): string | null {
  if (a.locationMode && a.location) return `${a.locationMode} — ${a.location}`;
  return a.locationMode || a.location || null;
}

// Pure, deterministic side-by-side comparison of the structured offer fields. No LLM — this
// is the factual half of a comparison; the AI verdict is generated separately.
export function buildOfferTable(apps: ComparableApp[]): OfferTable {
  const row = (label: string, get: (a: ComparableApp) => string | null): OfferTableRow => ({
    label,
    values: apps.map(get),
  });

  return {
    applications: apps.map((a) => ({ id: a.id, company: a.company, roleTitle: a.roleTitle })),
    rows: [
      row("Base pay", (a) => formatPay(a)),
      row("Bonus", (a) => a.bonus || null),
      row("Benefits", (a) => a.benefits || null),
      row("Location", location),
      row("Employment type", (a) => a.employmentType || null),
      row("Seniority", (a) => a.seniorityLevel || null),
      row("Tech stack", (a) => a.techStack || null),
      row("Company size", (a) => a.companySize || null),
      row("Company stage", (a) => a.companyStage || null),
      row("Industry", (a) => a.industry || null),
      row("Interest", (a) => (a.interestRating != null ? `${a.interestRating}/5` : null)),
      row("Pros", (a) => a.pros || null),
      row("Cons", (a) => a.cons || null),
    ],
  };
}
