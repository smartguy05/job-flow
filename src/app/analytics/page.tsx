"use client";

import { useEffect, useState } from "react";
import { api, STATUS_LABELS } from "@/lib/ui";
import { SMALL_SAMPLE, type Analytics, type FunnelRow, type RateBucket } from "@/lib/analytics";

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

// Marker for buckets too small to trust (n < SMALL_SAMPLE). Icon + text, never color alone.
function SmallSample() {
  return (
    <span className="text-xs whitespace-nowrap" style={{ color: "var(--warning)" }} title={`Fewer than ${SMALL_SAMPLE} applications — treat as anecdotal`}>
      ⚠ small n
    </span>
  );
}

// One horizontal bar per bucket: response rate on a fixed 0–100% scale. Small-sample buckets
// are drawn hollow (outline only) and labelled, so a 100% from n=1 doesn't read as a win.
function RateBars({ title, buckets, empty }: { title: string; buckets: RateBucket[]; empty?: string }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold mb-1">{title}</h2>
      <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>Response rate · n = applications</p>
      {buckets.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>{empty ?? "No data yet."}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {buckets.map((b) => (
            <div
              key={b.key}
              className="flex items-center gap-3 rounded-md -mx-1 px-1 py-0.5 hover:bg-[var(--surface-2)]"
              title={`${b.key}: ${b.responded} of ${b.n} responded (${pct(b.rate)})`}
            >
              <div className="text-sm w-24 sm:w-36 shrink-0 truncate" style={{ color: "var(--muted)" }}>{b.key}</div>
              <div className="flex-1 rounded-full h-3" style={{ background: "var(--surface-2)" }}>
                <div
                  className="h-3 rounded-full"
                  style={{
                    width: `${b.rate * 100}%`,
                    minWidth: b.rate > 0 ? 4 : 0,
                    background: b.smallSample ? "transparent" : "var(--accent)",
                    border: b.smallSample ? "1.5px solid var(--accent)" : undefined,
                  }}
                />
              </div>
              <div className="text-sm w-12 text-right font-semibold">{pct(b.rate)}</div>
              <div className="text-xs w-20 text-right" style={{ color: "var(--muted)" }}>
                {b.smallSample ? <SmallSample /> : `n=${b.n}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const STAGES: { key: keyof Pick<FunnelRow, "applied" | "responded" | "interviewed" | "offer">; label: string }[] = [
  { key: "applied", label: "Applied" },
  { key: "responded", label: "Responded" },
  { key: "interviewed", label: "Interviewed" },
  { key: "offer", label: "Offer / won" },
];
const STEP_RATE: Record<string, keyof FunnelRow | null> = {
  applied: null,
  responded: "responseRate",
  interviewed: "interviewConversion",
  offer: "offerConversion",
};

function Funnel({ funnel }: { funnel: Analytics["funnel"] }) {
  const o = funnel.overall;
  return (
    <section className="card p-5">
      <h2 className="font-semibold mb-1">Funnel</h2>
      <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>Each stage as a share of applications; % is conversion from the previous stage</p>
      <div className="flex flex-col gap-2 mb-5">
        {STAGES.map(({ key, label }) => {
          const v = o[key];
          const step = STEP_RATE[key];
          return (
            <div key={key} className="flex items-center gap-3" title={`${label}: ${v} of ${o.applied}`}>
              <div className="text-sm w-24 sm:w-32 shrink-0" style={{ color: "var(--muted)" }}>{label}</div>
              <div className="flex-1 rounded-full h-4" style={{ background: "var(--surface-2)" }}>
                <div className="h-4 rounded-full" style={{ width: `${o.applied ? (v / o.applied) * 100 : 0}%`, minWidth: v ? 4 : 0, background: "var(--accent)" }} />
              </div>
              <div className="text-sm w-8 text-right font-semibold">{v}</div>
              <div className="text-xs w-12 text-right" style={{ color: "var(--muted)" }}>{step ? pct(o[step] as number | null) : ""}</div>
            </div>
          );
        })}
      </div>
      {funnel.bySource.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--muted)" }}>
                <th className="py-1 pr-3 font-normal">Source</th>
                {STAGES.map((s) => <th key={s.key} className="py-1 px-2 font-normal text-right">{s.label}</th>)}
                <th className="py-1 pl-2" />
              </tr>
            </thead>
            <tbody>
              {funnel.bySource.map((row) => (
                <tr key={row.source} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="py-1.5 pr-3 capitalize">{row.source}</td>
                  {STAGES.map(({ key }) => {
                    const step = STEP_RATE[key];
                    return (
                      <td key={key} className="py-1.5 px-2 text-right tabular-nums">
                        {row[key]}
                        {step && <span className="text-xs ml-1" style={{ color: "var(--muted)" }}>({pct(row[step] as number | null)})</span>}
                      </td>
                    );
                  })}
                  <td className="py-1.5 pl-2 text-right">{row.smallSample && <SmallSample />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="text-3xl font-bold mt-1" style={{ color: "var(--primary)" }}>{value}</div>
      {hint && <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{hint}</div>}
    </div>
  );
}

export default function AnalyticsPage() {
  const [a, setA] = useState<Analytics | null>(null);
  useEffect(() => { api<Analytics>("/api/analytics").then(setA); }, []);
  if (!a) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  const months = Object.entries(a.byMonth).sort(([x], [y]) => x.localeCompare(y));
  const maxMonth = Math.max(1, ...months.map(([, v]) => v));
  const t = a.timeToFirstResponse;
  const days = (d: number | null) => (d == null ? "—" : `${d}d`);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total applications" value={String(a.total)} />
        <Stat label="Response rate" value={pct(a.responseRate)} hint="progressed, interviewed or replied" />
        <Stat label="Interview rate" value={pct(a.interviewRate)} hint={`${a.interviewsScheduled} interviews`} />
        <Stat label="Offers / Won" value={String(a.closedWon)} hint={`${a.closedLost} closed-lost`} />
        <Stat label="Resumes generated" value={String(a.resumesGenerated)} />
        <Stat label="Resumes sent" value={String(a.resumesSent)} />
        <Stat label="Avg base pay" value={a.avgBasePay != null ? `$${Math.round(a.avgBasePay / 1000)}k` : "—"} hint="range midpoints" />
        <Stat
          label="Median time to response"
          value={days(t.medianDays)}
          hint={t.n ? `p75 ${days(t.p75Days)} · n=${t.n}${t.smallSample ? " · small sample" : ""}` : "no responses yet"}
        />
      </div>

      {a.total > 0 && <Funnel funnel={a.funnel} />}

      {a.total > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <RateBars title="By resume variant" buckets={a.byResumeVariant} />
          <RateBars title="By seniority" buckets={a.bySeniority} />
          <RateBars title="By location mode" buckets={a.byLocationMode} />
          <RateBars title="By interest rating" buckets={a.byInterest} />
        </div>
      )}

      <section className="card p-5">
        <h2 className="font-semibold mb-3">Pipeline</h2>
        <div className="flex flex-col gap-2">
          {Object.keys(STATUS_LABELS).map((s) => {
            const v = a.byStatus[s] ?? 0;
            return (
              <div key={s} className="flex items-center gap-3">
                <div className="text-sm w-20 sm:w-32 shrink-0 truncate" style={{ color: "var(--muted)" }}>{STATUS_LABELS[s]}</div>
                <div className="flex-1 rounded-full h-4" style={{ background: "var(--surface-2)" }}>
                  <div className="h-4 rounded-full" style={{ width: `${a.total ? (v / a.total) * 100 : 0}%`, background: "var(--accent)" }} />
                </div>
                <div className="text-sm w-8 text-right">{v}</div>
              </div>
            );
          })}
        </div>
      </section>

      {Object.keys(a.countsBySource).length > 0 && (
        <section className="card p-5">
          <h2 className="font-semibold mb-3">By source</h2>
          <div className="flex flex-col gap-2">
            {Object.entries(a.countsBySource)
              .sort(([, x], [, y]) => y - x)
              .map(([src, n]) => (
                <div key={src} className="flex items-center gap-3">
                  <div className="text-sm w-20 sm:w-32 shrink-0 capitalize truncate" style={{ color: "var(--muted)" }}>{src}</div>
                  <div className="flex-1 rounded-full h-4" style={{ background: "var(--surface-2)" }}>
                    <div className="h-4 rounded-full" style={{ width: `${a.total ? (n / a.total) * 100 : 0}%`, background: "var(--accent)" }} />
                  </div>
                  <div className="text-sm w-8 text-right">{n}</div>
                </div>
              ))}
          </div>
        </section>
      )}

      {months.length > 0 && (
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Applications per month</h2>
          <div className="flex items-end gap-3 h-40 overflow-x-auto">
            {months.map(([m, v]) => (
              <div key={m} className="flex flex-col items-center gap-1 flex-1 min-w-[1.75rem]">
                <div className="w-full rounded-t" style={{ height: `${(v / maxMonth) * 100}%`, background: "var(--accent)", minHeight: 4 }} />
                <div className="text-xs" style={{ color: "var(--muted)" }}>{m.slice(2)}</div>
                <div className="text-xs font-semibold">{v}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
