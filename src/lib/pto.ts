// PTO math. Pure: no DB and no implicit "today".

export const PTO_KINDS = ["vacation", "sick", "holiday", "other"] as const;
export type PtoKind = (typeof PTO_KINDS)[number];

// Kinds that count against the yearly allowance (`job_benefits.pto_days`). Sick days and
// company holidays are tracked and totalled, but most policies don't deduct them.
export const PTO_DEDUCTED_KINDS: readonly PtoKind[] = ["vacation", "other"];

export type PtoLike = { startDate: string; days: number | null; kind: string };

export type PtoBalance = {
  year: number;
  allowance: number | null;
  used: number;
  remaining: number | null;
  byKind: Record<PtoKind, number>;
  entries: number;
};

const DAY = 24 * 60 * 60 * 1000;
const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

// Weekdays (Mon–Fri) in an inclusive YYYY-MM-DD range; 0 for a reversed range. Used as the
// default `days` of a PTO entry. Public holidays are not known, so they are not excluded.
export function businessDays(start: string, end: string): number {
  let n = 0;
  for (let t = utc(start), last = utc(end); t <= last; t += DAY) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

const round = (n: number) => Math.round(n * 100) / 100;

// Balance for one calendar year. An entry belongs to the year its startDate falls in (a
// trip over New Year counts toward the year it began).
export function ptoBalance(allowanceDays: number | null | undefined, entries: PtoLike[], year: number): PtoBalance {
  const byKind: Record<PtoKind, number> = { vacation: 0, sick: 0, holiday: 0, other: 0 };
  let count = 0;
  for (const e of entries) {
    if (!e.startDate?.startsWith(`${year}-`)) continue;
    count++;
    const kind = (PTO_KINDS as readonly string[]).includes(e.kind) ? (e.kind as PtoKind) : "other";
    byKind[kind] = round(byKind[kind] + (e.days ?? 0));
  }
  const used = round(PTO_DEDUCTED_KINDS.reduce((a, k) => a + byKind[k], 0));
  const allowance = allowanceDays ?? null;
  return { year, allowance, used, remaining: allowance == null ? null : round(allowance - used), byKind, entries: count };
}
