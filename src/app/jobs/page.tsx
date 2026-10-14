"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/ui";
import { formatTenure } from "@/lib/job-labels";

type Job = {
  id: number;
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  technologies: string[];
  tenureMonths: number | null;
  profileSyncedAt: string | null;
};

type ImportedJob = {
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  technologies: string[];
  achievements: string[];
  match: Match;
};

type Match = "exact" | "possible" | null;

type WonApplication = {
  applicationId: number;
  company: string;
  roleTitle: string;
  wonDate: string;
  pay: string | null;
  match: Match;
};

type Preview = { jobs: ImportedJob[]; applications: WonApplication[] };

function MatchBadge({ match }: { match: Match }) {
  if (!match) return null;
  return (
    <span className="badge ml-2" style={match === "exact" ? { background: "var(--surface-2)" } : { background: "#fef3c7", color: "#92400e" }}>
      {match === "exact" ? "already tracked" : "possible duplicate"}
    </span>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ company: "", title: "", startDate: "", endDate: "" });
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  // Selected items, keyed "job:<index>" (profile) or "app:<applicationId>" (won application).
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function load() {
    api<Job[]>("/api/jobs").then(setJobs);
  }
  useEffect(load, []);

  async function add() {
    setBusy("add");
    setErr("");
    try {
      const { id } = await api<{ id: number }>("/api/jobs", { method: "POST", body: JSON.stringify(form) });
      window.location.href = `/jobs/${id}`;
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
    }
  }

  async function startImport() {
    setBusy("import");
    setErr("");
    try {
      const found = await api<Preview>("/api/jobs/import", { method: "POST", body: "{}" });
      setPreview(found);
      // Pre-select only items that don't look like something already tracked.
      setPicked(
        new Set([
          ...found.applications.filter((a) => !a.match).map((a) => `app:${a.applicationId}`),
          ...found.jobs.flatMap((j, i) => (j.match ? [] : [`job:${i}`])),
        ]),
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setBusy("confirm");
    try {
      const jobs = preview.jobs.filter((_, i) => picked.has(`job:${i}`));
      const applicationIds = preview.applications
        .filter((a) => picked.has(`app:${a.applicationId}`))
        .map((a) => a.applicationId);
      await api("/api/jobs/import/confirm", { method: "POST", body: JSON.stringify({ jobs, applicationIds }) });
      setPreview(null);
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const toggle = (i: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Jobs</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Your employment history: pay, benefits and a work journal for each job. Winning an application adds it here.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" disabled={busy !== ""} onClick={startImport}>
            {busy === "import" ? "Looking for jobs…" : "Import from profile & applications"}
          </button>
          <button className="btn btn-primary" onClick={() => setAdding(!adding)}>Add job</button>
        </div>
      </div>
      {err && <p className="text-sm" style={{ color: "var(--danger)" }}>{err}</p>}

      {adding && (
        <section className="card p-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Company</label>
            <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div>
            <label className="label">Title</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="label">Start date</label>
            <input type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div>
            <label className="label">End date (blank = current)</label>
            <input type="date" className="input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <button className="btn btn-primary" disabled={busy !== "" || !form.company.trim() || !form.title.trim()} onClick={add}>
              {busy === "add" ? "Adding…" : "Create job"}
            </button>
          </div>
        </section>
      )}

      {preview && (
        <section className="card p-4">
          <h2 className="font-semibold mb-1">Jobs to import</h2>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            Pick the ones to add. Anything that looks like a job you already track (or appears in both lists) starts unchecked.
          </p>
          {preview.applications.length === 0 && preview.jobs.length === 0 && <p className="text-sm">No jobs found.</p>}
          {preview.applications.length > 0 && (
            <>
              <h3 className="label mt-1">Won applications without a job</h3>
              <div className="flex flex-col gap-2 mb-3">
                {preview.applications.map((a) => (
                  <label key={a.applicationId} className="flex items-start gap-2 rounded-md border p-2" style={{ borderColor: "var(--border)" }}>
                    <input type="checkbox" className="mt-1" checked={picked.has(`app:${a.applicationId}`)} onChange={() => toggle(`app:${a.applicationId}`)} />
                    <span className="text-sm">
                      <span className="font-semibold">{a.roleTitle}</span> at {a.company}
                      <span style={{ color: "var(--muted)" }}> · won {a.wonDate}{a.pay ? ` · ${a.pay}` : ""}</span>
                      <MatchBadge match={a.match} />
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
          {preview.jobs.length > 0 && (
            <>
              <h3 className="label mt-1">Found in your career profile</h3>
              <div className="flex flex-col gap-2">
                {preview.jobs.map((j, i) => (
                  <label key={i} className="flex items-start gap-2 rounded-md border p-2" style={{ borderColor: "var(--border)" }}>
                    <input type="checkbox" className="mt-1" checked={picked.has(`job:${i}`)} onChange={() => toggle(`job:${i}`)} />
                    <span className="text-sm">
                      <span className="font-semibold">{j.title}</span> at {j.company}
                      <span style={{ color: "var(--muted)" }}> · {j.startDate ?? "?"} – {j.endDate ?? "present"}</span>
                      <MatchBadge match={j.match} />
                      {j.achievements.length > 0 && (
                        <span className="block" style={{ color: "var(--muted)" }}>{j.achievements.length} achievement(s)</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
          <div className="flex gap-2 mt-3">
            <button className="btn btn-primary" disabled={busy !== "" || picked.size === 0} onClick={confirmImport}>
              {busy === "confirm" ? "Importing…" : `Import ${picked.size}`}
            </button>
            <button className="btn btn-ghost" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </section>
      )}

      {jobs === null ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No jobs yet. Add your current job, or import your history from your career profile.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {jobs.map((j) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="card p-4 block hover:opacity-90">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{j.title}</span>
                  <span style={{ color: "var(--muted)" }}> · {j.company}</span>
                  {!j.endDate && (
                    <span className="badge ml-2" style={{ background: "#d1fae5", color: "#065f46" }}>current</span>
                  )}
                </div>
                <span className="text-sm" style={{ color: "var(--muted)" }}>
                  {j.startDate ?? "?"} – {j.endDate ?? "present"}
                  {j.tenureMonths != null && ` · ${formatTenure(j.tenureMonths)}`}
                </span>
              </div>
              {j.technologies.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {j.technologies.map((t) => (
                    <span key={t} className="badge" style={{ background: "var(--surface-2)", textTransform: "none" }}>{t}</span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
