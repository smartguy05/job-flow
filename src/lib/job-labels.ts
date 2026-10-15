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

export const INVENTION_KIND_LABELS: Record<string, string> = {
  software: "Software",
  invention: "Invention",
  authorship: "Original work of authorship",
  other: "Other",
};

export const PERSON_RELATIONSHIP_LABELS: Record<string, string> = {
  manager: "Manager",
  skip: "Skip-level",
  peer: "Peer",
  report: "Direct report",
  mentor: "Mentor",
  stakeholder: "Stakeholder",
};

export const GOAL_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  done: "Done",
  dropped: "Dropped",
};

// Tabs on the job detail page, addressable by URL hash (e.g. /jobs/3#people).
export const JOB_TABS = [
  ["overview", "Overview"],
  ["pay", "Pay"],
  ["people", "People & 1:1s"],
  ["reviews", "Reviews & Goals"],
  ["journal", "Journal"],
] as const;
export type JobTab = (typeof JOB_TABS)[number][0];

export function jobTabFromHash(hash: string): JobTab {
  const key = hash.replace(/^#/, "");
  return (JOB_TABS.find(([k]) => k === key)?.[0] ?? "overview") as JobTab;
}

export type ChecklistItem = { text: string; done: boolean };

// Checklist <-> textarea text: one item per line, a leading "[x]" marks it done.
export function checklistToText(items: ChecklistItem[]): string {
  return items.map((i) => `${i.done ? "[x] " : ""}${i.text}`).join("\n");
}

export function textToChecklist(text: string): ChecklistItem[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/^\[x\]\s*/i.test(l) ? { text: l.replace(/^\[x\]\s*/i, ""), done: true } : { text: l, done: false }));
}
