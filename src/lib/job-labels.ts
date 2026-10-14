// Display helpers for the jobs pages (client-safe: no DB imports).

export const COMP_KIND_LABELS: Record<string, string> = {
  start: "Starting pay",
  raise: "Raise",
  promotion: "Promotion",
  adjustment: "Adjustment",
  bonus_payout: "Bonus payout",
  equity_grant: "Equity grant",
};

export const JOURNAL_KIND_LABELS: Record<string, string> = {
  achievement: "Achievement",
  feedback: "Feedback",
  complaint: "Complaint",
  note: "Note",
};

export function formatAmount(n: number | null, period: string, currency: string): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US")}${period === "hour" ? "/hr" : "/yr"} ${currency}`;
}

export function formatTenure(months: number | null): string {
  if (months == null) return "";
  if (months < 1) return "<1 mo";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y) return `${m} mo`;
  return m ? `${y} yr ${m} mo` : `${y} yr`;
}
