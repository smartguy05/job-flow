"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { api, fmtRelative, STATUS_LABELS, STATUS_ORDER } from "@/lib/ui";
import { formatPay } from "@/lib/job-fields";
import { filterApplications, type SortKey } from "@/lib/dashboard-filter";

const SORT_LABELS: Record<SortKey, string> = {
  activity: "Recent activity",
  applied: "Date applied",
  company: "Company A–Z",
  interest: "Interest",
};

type AppRow = {
  id: number;
  company: string;
  roleTitle: string;
  status: string;
  lastActivityAt: string;
  appliedAt: string | null;
  resumeCount: number;
  contact: { name: string; agency: string | null } | null;
  payMin: number | null;
  payMax: number | null;
  payCurrency: string | null;
  payPeriod: string | null;
  interestRating: number | null;
  nextActionDate: string | null;
};

type Attention = {
  id: number; company: string; roleTitle: string; daysQuiet: number;
  reason: "quiet" | "next_action_due"; nextAction: string | null;
};

export default function Dashboard() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [attention, setAttention] = useState<Attention[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [sort, setSort] = useState<SortKey>("activity");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api<AppRow[]>("/api/applications"), api<Attention[]>("/api/cron/reminders")])
      .then(([a, at]) => {
        setApps(a);
        setAttention(at);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = filterApplications(apps, {
    status: filter,
    query: q,
    includeClosed,
    sort,
    from: from || null,
    to: to || null,
  });

  const counts = STATUS_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = apps.filter((a) => a.status === s).length;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Applications</h1>
        <Link href="/capture" className="btn btn-primary">+ New application</Link>
      </div>

      {attention.length > 0 && (
        <div className="card p-4" style={{ borderColor: "var(--warning)" }}>
          <div className="font-semibold mb-2" style={{ color: "var(--warning)" }}>
            ⏳ Needs follow-up ({attention.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {attention.map((a) => (
              <Link key={a.id} href={`/applications/${a.id}`} className="text-sm px-3 py-1 rounded-md"
                style={{ background: "var(--surface-2)" }}>
                {a.company} — {a.roleTitle} ·{" "}
                <span style={{ color: "var(--muted)" }}>
                  {a.reason === "next_action_due" ? (a.nextAction || "action due") : `${a.daysQuiet}d quiet`}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center">
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
          <button className="btn btn-ghost whitespace-nowrap" onClick={() => setFilter("all")}
            style={filter === "all" ? { borderColor: "var(--accent)" } : {}}>
            All ({apps.length})
          </button>
          {STATUS_ORDER.map((s) => (
            <button key={s} className="btn btn-ghost whitespace-nowrap" onClick={() => setFilter(s)}
              style={filter === s ? { borderColor: "var(--accent)" } : {}}>
              {STATUS_LABELS[s]} ({counts[s]})
            </button>
          ))}
        </div>
        <input className="input w-full sm:w-auto sm:max-w-[220px] sm:ml-auto"
          placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center">
        <button className="btn btn-ghost whitespace-nowrap"
          onClick={() => setIncludeClosed((v) => !v)}
          aria-pressed={includeClosed}
          style={includeClosed ? { borderColor: "var(--accent)" } : {}}>
          {includeClosed ? "✓ " : ""}Include closed &amp; expired
        </button>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
          Sort
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>{SORT_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
          Applied
          <input type="date" className="input" value={from} max={to || undefined}
            onChange={(e) => setFrom(e.target.value)} aria-label="Applied from" />
          <span>–</span>
          <input type="date" className="input" value={to} min={from || undefined}
            onChange={(e) => setTo(e.target.value)} aria-label="Applied to" />
        </label>
        {(from || to) && (
          <button className="btn btn-ghost whitespace-nowrap"
            onClick={() => { setFrom(""); setTo(""); }}>Clear dates</button>
        )}
      </div>

      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center" style={{ color: "var(--muted)" }}>
          No applications yet. <Link href="/capture" className="underline">Capture your first one →</Link>
        </div>
      ) : (
        <>
        {/* Mobile: stacked cards */}
        <div className="flex flex-col gap-2 md:hidden">
          {filtered.map((a) => {
            const actionDue = a.nextActionDate && new Date(a.nextActionDate) <= new Date();
            return (
              <Link key={a.id} href={`/applications/${a.id}`}
                className="card p-3 flex flex-col gap-1.5 active:opacity-80">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate" style={{ color: "var(--accent)" }}>
                      {a.company || "(Company TBD)"}
                    </div>
                    <div className="text-sm truncate">{a.roleTitle}</div>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: "var(--muted)" }}>
                  {formatPay(a) && <span>{formatPay(a)}</span>}
                  {a.interestRating ? <span>{"★".repeat(a.interestRating)}</span> : null}
                  {a.contact?.name && <span>{a.contact.name}</span>}
                  {a.resumeCount > 0 && <span>{a.resumeCount} résumé{a.resumeCount === 1 ? "" : "s"}</span>}
                  <span>{fmtRelative(a.lastActivityAt)}</span>
                  {actionDue && (
                    <span className="badge" style={{ background: "#fef3c7", color: "#92400e" }}>action due</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Desktop: table */}
        <div className="card overflow-hidden hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
                <th className="text-left p-3 font-semibold">Company</th>
                <th className="text-left p-3 font-semibold">Role</th>
                <th className="text-left p-3 font-semibold">Status</th>
                <th className="text-left p-3 font-semibold">Pay</th>
                <th className="text-left p-3 font-semibold">Interest</th>
                <th className="text-left p-3 font-semibold">Contact</th>
                <th className="text-left p-3 font-semibold">Resumes</th>
                <th className="text-left p-3 font-semibold">Activity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-t hover:opacity-90" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3">
                    <Link href={`/applications/${a.id}`} className="font-semibold hover:underline"
                      style={{ color: "var(--accent)" }}>
                      {a.company || "(Company TBD)"}
                    </Link>
                  </td>
                  <td className="p-3">
                    {a.roleTitle}
                    {a.nextActionDate && new Date(a.nextActionDate) <= new Date() && (
                      <span className="badge ml-2" style={{ background: "#fef3c7", color: "#92400e" }}>action due</span>
                    )}
                  </td>
                  <td className="p-3"><StatusBadge status={a.status} /></td>
                  <td className="p-3" style={{ color: "var(--muted)" }}>{formatPay(a) ?? "—"}</td>
                  <td className="p-3" style={{ color: "var(--muted)" }}>{a.interestRating ? "★".repeat(a.interestRating) : "—"}</td>
                  <td className="p-3" style={{ color: "var(--muted)" }}>{a.contact?.name ?? "—"}</td>
                  <td className="p-3" style={{ color: "var(--muted)" }}>{a.resumeCount}</td>
                  <td className="p-3" style={{ color: "var(--muted)" }}>{fmtRelative(a.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
