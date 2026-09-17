// Client-side dashboard filtering + sorting. Kept as a pure module (no React, no DB) so the
// logic can be unit-tested in isolation. `src/app/page.tsx` fetches every application in one
// request and narrows the list with this function.

// Terminal statuses hidden from the dashboard by default. This is the complement of the
// "open/active" set in src/lib/expiry.ts (`OPEN = ["applied", "in_progress"]`): apps become
// `expired` via the lazy expiry sweep, and `closed_won`/`closed_lost` are the manual terminal
// outcomes. Keep these two lists in sync when statuses change.
export const HIDDEN_STATUSES = ["expired", "closed_won", "closed_lost"] as const;

export type SortKey = "activity" | "applied" | "company" | "interest";

export interface DashboardFilter {
  status: string; // "all" or a specific status value
  query: string; // company/role substring
  includeClosed: boolean; // reveal expired/closed when true
  sort: SortKey;
  from?: string | null; // ISO date (YYYY-MM-DD) lower bound on appliedAt, inclusive
  to?: string | null; // ISO date (YYYY-MM-DD) upper bound on appliedAt, inclusive
}

type AppLike = {
  status: string;
  company: string;
  roleTitle: string;
  appliedAt: string | null;
  lastActivityAt: string;
  interestRating: number | null;
};

const hidden = new Set<string>(HIDDEN_STATUSES);

function time(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

export function filterApplications<T extends AppLike>(apps: T[], f: DashboardFilter): T[] {
  const q = f.query.trim().toLowerCase();
  // Range bounds. `to` is inclusive of the whole day, so push it to the end of that date.
  const fromMs = f.from ? new Date(`${f.from}T00:00:00`).getTime() : null;
  const toMs = f.to ? new Date(`${f.to}T23:59:59.999`).getTime() : null;
  const rangeActive = fromMs !== null || toMs !== null;

  const rows = apps.filter((a) => {
    // Status / hide. Selecting a specific status always shows it (reveals hidden ones);
    // otherwise hide terminal statuses unless includeClosed is set.
    if (f.status !== "all") {
      if (a.status !== f.status) return false;
    } else if (!f.includeClosed && hidden.has(a.status)) {
      return false;
    }

    if (q && !`${a.company} ${a.roleTitle}`.toLowerCase().includes(q)) return false;

    if (rangeActive) {
      const applied = time(a.appliedAt);
      if (applied === null) return false; // undated apps drop out once a range is set
      if (fromMs !== null && applied < fromMs) return false;
      if (toMs !== null && applied > toMs) return false;
    }

    return true;
  });

  return sortApplications(rows, f.sort);
}

function sortApplications<T extends AppLike>(rows: T[], sort: SortKey): T[] {
  const copy = [...rows];
  switch (sort) {
    case "applied":
      return copy.sort((a, b) => (time(b.appliedAt) ?? -Infinity) - (time(a.appliedAt) ?? -Infinity));
    case "company":
      return copy.sort((a, b) => {
        // Blank companies sort last, then A–Z case-insensitive.
        if (!a.company && !b.company) return 0;
        if (!a.company) return 1;
        if (!b.company) return -1;
        return a.company.toLowerCase().localeCompare(b.company.toLowerCase());
      });
    case "interest":
      return copy.sort((a, b) => (b.interestRating ?? -Infinity) - (a.interestRating ?? -Infinity));
    case "activity":
    default:
      return copy.sort((a, b) => (time(b.lastActivityAt) ?? 0) - (time(a.lastActivityAt) ?? 0));
  }
}
