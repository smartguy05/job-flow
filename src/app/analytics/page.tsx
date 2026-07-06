"use client";

import { useEffect, useState } from "react";
import { api, STATUS_LABELS } from "@/lib/ui";

type Analytics = {
  total: number;
  byStatus: Record<string, number>;
  responseRate: number;
  interviewRate: number;
  closedWon: number;
  closedLost: number;
  interviewsScheduled: number;
  resumesGenerated: number;
  resumesSent: number;
  byMonth: Record<string, number>;
  avgBasePay: number | null;
  countsBySource: Record<string, number>;
};

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
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total applications" value={String(a.total)} />
        <Stat label="Response rate" value={pct(a.responseRate)} hint="moved past 'Applied'" />
        <Stat label="Interview rate" value={pct(a.interviewRate)} hint={`${a.interviewsScheduled} interviews`} />
        <Stat label="Offers / Won" value={String(a.closedWon)} hint={`${a.closedLost} closed-lost`} />
        <Stat label="Resumes generated" value={String(a.resumesGenerated)} />
        <Stat label="Resumes sent" value={String(a.resumesSent)} />
        <Stat label="Avg base pay" value={a.avgBasePay != null ? `$${Math.round(a.avgBasePay / 1000)}k` : "—"} hint="range midpoints" />
      </div>

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
