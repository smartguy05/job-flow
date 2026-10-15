"use client";

import { useState } from "react";
import { api } from "@/lib/ui";
import { ProfileSyncPanel } from "@/components/ProfileSyncPanel";
import { Status, muted, useActions, type Job, type TabProps } from "./shared";

const JOB_TEXT_FIELDS: [keyof Job, string][] = [
  ["company", "Company"],
  ["title", "Current title"],
  ["team", "Team"],
  ["manager", "Manager (free text; people with dates take precedence)"],
  ["employmentType", "Employment type"],
  ["locationMode", "Remote / hybrid / onsite"],
  ["location", "Location"],
];

export function OverviewTab({ id, d, reload }: TabProps) {
  const [job, setJob] = useState<Job>(d.job);
  const [tech, setTech] = useState(d.job.technologies.join(", "));
  const { busy, err, msg, run } = useActions(reload);
  // Reset the form when the job reloads (React's "adjust state on prop change" pattern).
  const [loaded, setLoaded] = useState(d.job);
  if (loaded !== d.job) {
    setLoaded(d.job);
    setJob(d.job);
    setTech(d.job.technologies.join(", "));
  }

  const saveJob = () =>
    run("job", () => api(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ ...job, technologies: tech }) }), "Job saved.");

  return (
    <div className="flex flex-col gap-6">
      <section className="card p-4">
        <h2 className="font-semibold mb-3">Overview</h2>
        <Status err={err} msg={msg} />
        <p className="text-sm mb-3" style={muted}>
          Current manager: <strong>{d.currentManager ?? "—"}</strong>
          {d.managerHistory.length > 1 && ` · ${d.managerHistory.length} managers on record (see People & 1:1s)`}
        </p>
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
          <div>
            <label className="label">Next performance review</label>
            <input type="date" className="input" value={job.nextReviewDate ?? ""}
              onChange={(e) => setJob({ ...job, nextReviewDate: e.target.value })} />
            <p className="text-xs mt-1" style={muted}>Shown on the calendar; you get a reminder two weeks before.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Technologies (comma-separated)</label>
            <input className="input" value={tech} onChange={(e) => setTech(e.target.value)} placeholder="TypeScript, Postgres, Kubernetes" />
            {d.technologies.length > job.technologies.length && (
              <p className="text-xs mt-1" style={muted}>Including journal entries: {d.technologies.join(", ")}</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes (private)</label>
            <textarea className="textarea" rows={3} value={job.notes ?? ""} onChange={(e) => setJob({ ...job, notes: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Reason for leaving (private)</label>
            <textarea className="textarea" rows={2} value={job.reasonForLeaving ?? ""}
              onChange={(e) => setJob({ ...job, reasonForLeaving: e.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary mt-3" disabled={busy === "job"} onClick={saveJob}>
          {busy === "job" ? "Saving…" : "Save job"}
        </button>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-1">Update career profile</h2>
        <p className="text-sm mb-2" style={muted}>
          Have the AI fold this job, its title changes, technologies and unsynced achievements into your career
          profile. You review the diff before anything is saved.
        </p>
        <ProfileSyncPanel jobIds={[d.job.id]} onSaved={() => reload()} />
      </section>
    </div>
  );
}
