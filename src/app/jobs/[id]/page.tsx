"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/ui";
import { COMP_KIND_LABELS, JOURNAL_KIND_LABELS, formatAmount, formatTenure } from "@/lib/job-labels";
import { ProfileSyncPanel } from "@/components/ProfileSyncPanel";

type Job = {
  id: number;
  applicationId: number | null;
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  employmentType: string | null;
  locationMode: string | null;
  location: string | null;
  manager: string | null;
  team: string | null;
  technologies: string[];
  reasonForLeaving: string | null;
  notes: string | null;
  tenureMonths: number | null;
};
type CompStep = {
  id: number;
  effectiveDate: string | null;
  kind: string;
  title: string | null;
  baseAmount: number | null;
  currency: string;
  period: string;
  bonus: string | null;
  equity: string | null;
  notes: string | null;
  changePct: number | null;
};
type Benefits = {
  health: string | null;
  retirement: string | null;
  ptoDays: number | null;
  parentalLeave: string | null;
  remotePolicy: string | null;
  other: string | null;
};
type Entry = {
  id: number;
  entryDate: string | null;
  kind: string;
  title: string;
  body: string;
  impact: string | null;
  technologies: string[];
  syncedAt: string | null;
};
type Detail = {
  job: Job;
  compSummary: {
    steps: CompStep[];
    current: { baseAmount: number; currency: string; period: string } | null;
    totalGrowthPct: number | null;
  };
  benefits: Benefits | null;
  entries: Entry[];
  technologies: string[];
};

const JOB_TEXT_FIELDS: [keyof Job, string][] = [
  ["company", "Company"],
  ["title", "Current title"],
  ["team", "Team"],
  ["manager", "Manager"],
  ["employmentType", "Employment type"],
  ["locationMode", "Remote / hybrid / onsite"],
  ["location", "Location"],
];

const BENEFIT_FIELDS: [keyof Benefits, string][] = [
  ["health", "Health insurance"],
  ["retirement", "Retirement (e.g. 401k match)"],
  ["ptoDays", "PTO days / year"],
  ["parentalLeave", "Parental leave"],
  ["remotePolicy", "Remote policy"],
];

const EMPTY_COMP = { kind: "raise", effectiveDate: "", baseAmount: "", title: "", bonus: "", equity: "", notes: "" };
const EMPTY_ENTRY = { kind: "achievement", entryDate: "", title: "", body: "", impact: "", technologies: "" };

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [tech, setTech] = useState("");
  const [benefits, setBenefits] = useState<Record<string, string>>({});
  const [comp, setComp] = useState(EMPTY_COMP);
  const [entry, setEntry] = useState(EMPTY_ENTRY);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const apply = useCallback((data: Detail) => {
    setD(data);
    setJob(data.job);
    setTech(data.job.technologies.join(", "));
    const b = data.benefits;
    setBenefits(
      Object.fromEntries([...BENEFIT_FIELDS.map(([k]) => k), "other"].map((k) => [k, b?.[k as keyof Benefits]?.toString() ?? ""])),
    );
  }, []);
  const load = useCallback(() => api<Detail>(`/api/jobs/${id}`).then(apply), [id, apply]);
  useEffect(() => {
    api<Detail>(`/api/jobs/${id}`).then(apply);
  }, [id, apply]);

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    setErr("");
    try {
      await fn();
      await load();
      if (ok) {
        setMsg(ok);
        setTimeout(() => setMsg(""), 2000);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (!d || !job) return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>;

  const saveJob = () =>
    run("job", () => api(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ ...job, technologies: tech }) }), "Job saved.");
  const saveBenefits = () =>
    run("benefits", () => api(`/api/jobs/${id}/benefits`, { method: "PUT", body: JSON.stringify(benefits) }), "Benefits saved.");
  const addComp = () =>
    run("comp", async () => {
      await api(`/api/jobs/${id}/compensation`, { method: "POST", body: JSON.stringify(comp) });
      setComp(EMPTY_COMP);
    });
  const delComp = (compId: number) =>
    run(`comp-${compId}`, () => api(`/api/jobs/${id}/compensation/${compId}`, { method: "DELETE" }));
  const addEntry = () =>
    run("entry", async () => {
      await api(`/api/jobs/${id}/journal`, { method: "POST", body: JSON.stringify(entry) });
      setEntry({ ...EMPTY_ENTRY, kind: entry.kind });
    });
  const delEntry = (entryId: number) => run(`entry-${entryId}`, () => api(`/api/journal/${entryId}`, { method: "DELETE" }));
  async function delJob() {
    if (!confirm("Delete this job and all its pay, benefits and journal entries?")) return;
    await api(`/api/jobs/${id}`, { method: "DELETE" });
    window.location.href = "/jobs";
  }

  const entries = d.entries.filter((e) => !filter || e.kind === filter);
  const s = d.compSummary;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/jobs" className="text-sm hover:underline" style={{ color: "var(--muted)" }}>← All jobs</Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mt-2">
          <div>
            <h1 className="text-2xl font-bold">{d.job.title}</h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {d.job.company} · {d.job.startDate ?? "?"} – {d.job.endDate ?? "present"}
              {d.job.tenureMonths != null && ` · ${formatTenure(d.job.tenureMonths)}`}
              {d.job.applicationId && (
                <> · <Link href={`/applications/${d.job.applicationId}`} className="hover:underline" style={{ color: "var(--accent)" }}>original application</Link></>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {msg && <span className="text-sm" style={{ color: "var(--success)" }}>{msg}</span>}
            <button className="btn btn-danger" onClick={delJob}>Delete</button>
          </div>
        </div>
        {err && <p className="text-sm mt-2" style={{ color: "var(--danger)" }}>{err}</p>}
      </div>

      <section className="card p-4">
        <h2 className="font-semibold mb-3">Overview</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {JOB_TEXT_FIELDS.map(([k, label]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <input className="input" value={(job[k] as string | null) ?? ""} onChange={(e) => setJob({ ...job, [k]: e.target.value })} />
            </div>
          ))}
          <div>
            <label className="label">Start date</label>
            <input type="date" className="input" value={job.startDate ?? ""} onChange={(e) => setJob({ ...job, startDate: e.target.value })} />
          </div>
          <div>
            <label className="label">End date (blank = current)</label>
            <input type="date" className="input" value={job.endDate ?? ""} onChange={(e) => setJob({ ...job, endDate: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Technologies (comma-separated)</label>
            <input className="input" value={tech} onChange={(e) => setTech(e.target.value)} placeholder="TypeScript, Postgres, Kubernetes" />
            {d.technologies.length > job.technologies.length && (
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                Including journal entries: {d.technologies.join(", ")}
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes (private)</label>
            <textarea className="textarea" rows={3} value={job.notes ?? ""} onChange={(e) => setJob({ ...job, notes: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Reason for leaving (private)</label>
            <textarea className="textarea" rows={2} value={job.reasonForLeaving ?? ""} onChange={(e) => setJob({ ...job, reasonForLeaving: e.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary mt-3" disabled={busy === "job"} onClick={saveJob}>
          {busy === "job" ? "Saving…" : "Save job"}
        </button>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="font-semibold">Compensation</h2>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            {s.current ? `Current base ${formatAmount(s.current.baseAmount, s.current.period, s.current.currency)}` : "No pay recorded"}
            {s.totalGrowthPct != null && ` · ${s.totalGrowthPct >= 0 ? "+" : ""}${s.totalGrowthPct}% since start`}
          </span>
        </div>
        {s.steps.length > 0 && (
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--muted)" }}>
                  <th className="py-1 pr-3">Date</th><th className="pr-3">Change</th><th className="pr-3">Base</th>
                  <th className="pr-3">Δ</th><th className="pr-3">Bonus / equity</th><th />
                </tr>
              </thead>
              <tbody>
                {s.steps.map((c) => (
                  <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1 pr-3 whitespace-nowrap">{c.effectiveDate ?? "—"}</td>
                    <td className="pr-3">{COMP_KIND_LABELS[c.kind] ?? c.kind}{c.title ? ` — ${c.title}` : ""}</td>
                    <td className="pr-3 whitespace-nowrap">{formatAmount(c.baseAmount, c.period, c.currency)}</td>
                    <td className="pr-3" style={{ color: c.changePct != null && c.changePct > 0 ? "var(--success)" : undefined }}>
                      {c.changePct != null ? `${c.changePct > 0 ? "+" : ""}${c.changePct}%` : ""}
                    </td>
                    <td className="pr-3">{[c.bonus, c.equity, c.notes].filter(Boolean).join(" · ")}</td>
                    <td className="text-right">
                      <button className="text-xs hover:underline" style={{ color: "var(--danger)" }} onClick={() => delComp(c.id)}>remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-4">
          <select className="select" value={comp.kind} onChange={(e) => setComp({ ...comp, kind: e.target.value })}>
            {Object.entries(COMP_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input type="date" className="input" value={comp.effectiveDate} onChange={(e) => setComp({ ...comp, effectiveDate: e.target.value })} />
          <input className="input" inputMode="numeric" placeholder="New base (e.g. 150000)" value={comp.baseAmount}
            onChange={(e) => setComp({ ...comp, baseAmount: e.target.value })} />
          <input className="input" placeholder="New title (promotions)" value={comp.title} onChange={(e) => setComp({ ...comp, title: e.target.value })} />
          <input className="input" placeholder="Bonus" value={comp.bonus} onChange={(e) => setComp({ ...comp, bonus: e.target.value })} />
          <input className="input" placeholder="Equity" value={comp.equity} onChange={(e) => setComp({ ...comp, equity: e.target.value })} />
          <input className="input sm:col-span-2" placeholder="Notes" value={comp.notes} onChange={(e) => setComp({ ...comp, notes: e.target.value })} />
        </div>
        <button className="btn btn-primary mt-2" disabled={busy === "comp"} onClick={addComp}>
          {busy === "comp" ? "Adding…" : "Add pay change"}
        </button>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-3">Benefits</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {BENEFIT_FIELDS.map(([k, label]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <input className="input" inputMode={k === "ptoDays" ? "numeric" : undefined} value={benefits[k] ?? ""}
                onChange={(e) => setBenefits({ ...benefits, [k]: e.target.value })} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="label">Other (perks, stipends, insurance details…)</label>
            <textarea className="textarea" rows={3} value={benefits.other ?? ""} onChange={(e) => setBenefits({ ...benefits, other: e.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary mt-3" disabled={busy === "benefits"} onClick={saveBenefits}>
          {busy === "benefits" ? "Saving…" : "Save benefits"}
        </button>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-semibold">Work journal</h2>
          <select className="select" style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All entries</option>
            {Object.entries(JOURNAL_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="rounded-md border p-3 mb-4 grid gap-2 sm:grid-cols-3" style={{ borderColor: "var(--accent)" }}>
          <select className="select" value={entry.kind} onChange={(e) => setEntry({ ...entry, kind: e.target.value })}>
            {Object.entries(JOURNAL_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input type="date" className="input" value={entry.entryDate} onChange={(e) => setEntry({ ...entry, entryDate: e.target.value })} />
          <input className="input" placeholder="Title" value={entry.title} onChange={(e) => setEntry({ ...entry, title: e.target.value })} />
          <textarea className="textarea sm:col-span-3" rows={2} placeholder="Details" value={entry.body}
            onChange={(e) => setEntry({ ...entry, body: e.target.value })} />
          {entry.kind === "achievement" && (
            <input className="input" placeholder="Impact (e.g. cut costs 30%)" value={entry.impact}
              onChange={(e) => setEntry({ ...entry, impact: e.target.value })} />
          )}
          <input className={`input ${entry.kind === "achievement" ? "sm:col-span-2" : "sm:col-span-3"}`}
            placeholder="Technologies used (comma-separated)" value={entry.technologies}
            onChange={(e) => setEntry({ ...entry, technologies: e.target.value })} />
          <div className="sm:col-span-3 flex items-center gap-3">
            <button className="btn btn-primary" disabled={busy === "entry" || !entry.title.trim()} onClick={addEntry}>
              {busy === "entry" ? "Adding…" : "Add entry"}
            </button>
            {(entry.kind === "complaint" || entry.kind === "note") && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>Private: never added to your career profile.</span>
            )}
          </div>
        </div>
        {entries.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>No entries yet.</p>}
        <div className="flex flex-col gap-2">
          {entries.map((e) => (
            <div key={e.id} className="rounded-md border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="badge mr-2" style={{ background: "var(--surface-2)" }}>{JOURNAL_KIND_LABELS[e.kind] ?? e.kind}</span>
                  <span className="font-semibold">{e.title}</span>
                  <span style={{ color: "var(--muted)" }}> · {e.entryDate ?? "—"}</span>
                  {(e.kind === "achievement" || e.kind === "feedback") && !e.syncedAt && (
                    <span className="badge ml-2" style={{ background: "#fef3c7", color: "#92400e" }}>not in profile</span>
                  )}
                </div>
                <button className="text-xs hover:underline" style={{ color: "var(--danger)" }} onClick={() => delEntry(e.id)}>delete</button>
              </div>
              {e.body && <p className="text-sm mt-1 whitespace-pre-wrap">{e.body}</p>}
              {e.impact && <p className="text-sm mt-1" style={{ color: "var(--success)" }}>Impact: {e.impact}</p>}
              {e.technologies.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {e.technologies.map((t) => (
                    <span key={t} className="badge" style={{ background: "var(--surface-2)", textTransform: "none" }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-1">Update career profile</h2>
        <p className="text-sm mb-2" style={{ color: "var(--muted)" }}>
          Have the AI fold this job, its title changes, technologies and unsynced achievements into your career
          profile. You review the diff before anything is saved.
        </p>
        <ProfileSyncPanel jobIds={[d.job.id]} onSaved={() => load()} />
      </section>
    </div>
  );
}
