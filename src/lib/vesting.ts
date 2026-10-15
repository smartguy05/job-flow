// Equity vesting math. Pure (no DB, no Date.now()): every function takes the grant and, where
// it matters, an explicit `asOf` date, so the schedule is table-testable.
//
// Model: shares vest linearly over `vestMonths` from `vestStart` (falling back to the grant
// date), on a `frequency` grid (every 1, 3 or 12 months). Nothing vests before `cliffMonths`;
// on the cliff date everything accrued so far vests at once. Each vest releases whole shares
// (cumulative = floor(shares * monthsElapsed / vestMonths)), and the last vest takes the
// remainder so the schedule always sums to `shares`. vestMonths 0 vests everything at the start.

export const EQUITY_TYPES = ["RSU", "ISO", "NSO", "ESPP", "other"] as const;
export const VEST_FREQUENCIES = ["monthly", "quarterly", "annual"] as const;
export type VestFrequency = (typeof VEST_FREQUENCIES)[number];

const STEP_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, annual: 12 };

export type VestGrant = {
  grantDate: string | null;
  vestStart: string | null;
  shares: number;
  cliffMonths: number;
  vestMonths: number;
  frequency: string;
};

export type VestEvent = { date: string; shares: number; cumulative: number };

const pad = (n: number) => String(n).padStart(2, "0");

// Calendar-month addition on YYYY-MM-DD strings, clamping to the end of shorter months
// (Jan 31 + 1 month = Feb 28/29). Always counted from the original date, so a month-end
// start stays on month ends rather than drifting to the 28th.
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12; // 0-based
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, lastDay))}`;
}

export function vestingSchedule(g: VestGrant): VestEvent[] {
  const start = g.vestStart || g.grantDate;
  const total = Math.max(0, Math.floor(g.shares || 0));
  if (!start || total === 0) return [];
  const vestMonths = Math.max(0, Math.floor(g.vestMonths || 0));
  if (vestMonths === 0) return [{ date: start, shares: total, cumulative: total }];

  const step = STEP_MONTHS[g.frequency] ?? 1;
  const cliff = Math.min(Math.max(0, Math.floor(g.cliffMonths || 0)), vestMonths);
  const months = new Set<number>([vestMonths]);
  for (let m = step; m < vestMonths; m += step) months.add(m);
  if (cliff > 0) months.add(cliff);

  const out: VestEvent[] = [];
  let prev = 0;
  for (const m of [...months].filter((m) => m >= cliff).sort((a, b) => a - b)) {
    const cumulative = m === vestMonths ? total : Math.floor((total * m) / vestMonths);
    if (cumulative <= prev) continue;
    out.push({ date: addMonths(start, m), shares: cumulative - prev, cumulative });
    prev = cumulative;
  }
  return out;
}

// Shares vested on or before `asOf` (a vest on the asOf date counts).
export function vestedAsOf(g: VestGrant, asOf: string): number {
  let vested = 0;
  for (const e of vestingSchedule(g)) if (e.date <= asOf) vested = e.cumulative;
  return vested;
}

// The first vest strictly after `asOf`, or null once fully vested.
export function nextVest(g: VestGrant, asOf: string): { date: string; shares: number } | null {
  const e = vestingSchedule(g).find((v) => v.date > asOf);
  return e ? { date: e.date, shares: e.shares } : null;
}

export type GrantSummary = {
  vested: number;
  unvested: number;
  nextVest: { date: string; shares: number } | null;
  fullyVestedOn: string | null;
};

export function equityGrantSummary(g: VestGrant, asOf: string): GrantSummary {
  const schedule = vestingSchedule(g);
  const vested = vestedAsOf(g, asOf);
  const total = schedule.at(-1)?.cumulative ?? 0;
  return {
    vested,
    unvested: total - vested,
    nextVest: nextVest(g, asOf),
    fullyVestedOn: schedule.at(-1)?.date ?? null,
  };
}

export type EquityTotals = {
  shares: number;
  vested: number;
  unvested: number;
  nextVest: { date: string; shares: number; grantId: number } | null;
};

// Totals across grants, plus the soonest upcoming vest of any grant.
export function equityTotals(grants: (VestGrant & { id: number })[], asOf: string): EquityTotals {
  const t: EquityTotals = { shares: 0, vested: 0, unvested: 0, nextVest: null };
  for (const g of grants) {
    const s = equityGrantSummary(g, asOf);
    t.shares += s.vested + s.unvested;
    t.vested += s.vested;
    t.unvested += s.unvested;
    if (s.nextVest && (!t.nextVest || s.nextVest.date < t.nextVest.date)) t.nextVest = { ...s.nextVest, grantId: g.id };
  }
  return t;
}
