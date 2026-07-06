// The optional detail fields shared by the create/update application routes.
// Kept in one place so POST and PATCH coerce them identically.

const TEXT_FIELDS = [
  "payCurrency", "payPeriod", "bonus", "benefits", "locationMode", "location", "employmentType",
  "seniorityLevel", "techStack", "companySize", "companyStage", "industry", "sourceChannel",
  "postingId", "referralName", "pros", "cons", "nextAction",
] as const;

const INT_FIELDS = ["payMin", "payMax", "interestRating"] as const;

const DATE_FIELDS = ["datePosted", "applicationDeadline", "nextActionDate"] as const;

// Returns only the detail fields present in the body, coerced to column types.
// A key present with `null` clears the column; an absent key is left untouched
// (so PATCH callers can update a subset without wiping the rest).
export function detailFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => {
    if (body[k] !== undefined) out[k] = v;
  };
  for (const f of TEXT_FIELDS) set(f, body[f] ?? null);
  for (const f of INT_FIELDS) set(f, body[f] == null ? null : Number(body[f]));
  for (const f of DATE_FIELDS) set(f, body[f] ? new Date(body[f] as string) : null);
  return out;
}
