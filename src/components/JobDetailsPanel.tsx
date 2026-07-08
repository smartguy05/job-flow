"use client";

import { useState } from "react";
import { api } from "@/lib/ui";
import { LOCATION_MODES, EMPLOYMENT_TYPES, PAY_PERIODS, type JobDetails } from "@/lib/job-fields";

type Props = { applicationId: number; initial: Partial<JobDetails>; onSaved: () => void };

// datetime columns come back as ISO strings; <input type=date> wants YYYY-MM-DD.
function toDateInput(v: string | null | undefined): string {
  return v ? new Date(v).toISOString().slice(0, 10) : "";
}

// A labelled text input. Defined at module scope (NOT inside JobDetailsPanel) so its
// component identity is stable across renders — otherwise React remounts the <input> on
// every keystroke and the field loses focus after a single character.
function TextField({
  label, value, onChange, span,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  span?: string;
}) {
  return (
    <div className={span}>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function JobDetailsPanel({ applicationId, initial, onSaved }: Props) {
  const [d, setD] = useState<Partial<JobDetails>>({
    ...initial,
    appliedAt: toDateInput(initial.appliedAt) || null,
    datePosted: toDateInput(initial.datePosted) || null,
    applicationDeadline: toDateInput(initial.applicationDeadline) || null,
    nextActionDate: toDateInput(initial.nextActionDate) || null,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const set = (k: keyof JobDetails, v: string | number | null) => setD((p) => ({ ...p, [k]: v }));
  const num = (k: keyof JobDetails, v: string) => set(k, v === "" ? null : Number(v));

  async function save() {
    setBusy(true);
    try {
      await api(`/api/applications/${applicationId}`, { method: "PATCH", body: JSON.stringify(d) });
      setMsg("Saved.");
      setTimeout(() => setMsg(""), 1500);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  // Helper that RETURNS a <TextField> element (a function call, not a JSX component
  // boundary) so it doesn't introduce an unstable component type into the tree.
  const text = (k: keyof JobDetails, label: string, span?: string) => (
    <TextField label={label} span={span} value={(d[k] as string) ?? ""} onChange={(v) => set(k, v)} />
  );

  return (
    <section className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Job details</h2>
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm" style={{ color: "var(--success)" }}>{msg}</span>}
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save details"}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="label">Pay min</label>
          <input className="input" type="number" value={d.payMin ?? ""} onChange={(e) => num("payMin", e.target.value)} />
        </div>
        <div>
          <label className="label">Pay max</label>
          <input className="input" type="number" value={d.payMax ?? ""} onChange={(e) => num("payMax", e.target.value)} />
        </div>
        {text("payCurrency", "Currency")}
        <div>
          <label className="label">Period</label>
          <select className="select" value={d.payPeriod ?? ""} onChange={(e) => set("payPeriod", e.target.value || null)}>
            <option value="">—</option>
            {PAY_PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {text("bonus", "Bonus")}
        {text("benefits", "Benefits", "sm:col-span-2 md:col-span-3")}

        <div>
          <label className="label">Work mode</label>
          <select className="select" value={d.locationMode ?? ""} onChange={(e) => set("locationMode", e.target.value || null)}>
            <option value="">—</option>
            {LOCATION_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {text("location", "Location")}
        <div>
          <label className="label">Employment type</label>
          <select className="select" value={d.employmentType ?? ""} onChange={(e) => set("employmentType", e.target.value || null)}>
            <option value="">—</option>
            {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {text("seniorityLevel", "Seniority")}
        {text("techStack", "Tech stack", "sm:col-span-2 md:col-span-4")}
        {text("companySize", "Company size")}
        {text("companyStage", "Company stage")}
        {text("industry", "Industry")}
        {text("sourceChannel", "Source / channel")}
        <div>
          <label className="label">Applied</label>
          <input className="input" type="date" value={(d.appliedAt as string) ?? ""} onChange={(e) => set("appliedAt", e.target.value || null)} />
        </div>
        <div>
          <label className="label">Date posted</label>
          <input className="input" type="date" value={(d.datePosted as string) ?? ""} onChange={(e) => set("datePosted", e.target.value || null)} />
        </div>
        <div>
          <label className="label">Deadline</label>
          <input className="input" type="date" value={(d.applicationDeadline as string) ?? ""} onChange={(e) => set("applicationDeadline", e.target.value || null)} />
        </div>
        {text("postingId", "Posting / req ID")}
        {text("referralName", "Referral name")}
      </div>

      <hr style={{ borderColor: "var(--border)" }} />
      <h3 className="font-semibold">Your assessment</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="label">Interest</label>
          <select className="select" value={d.interestRating ?? ""} onChange={(e) => num("interestRating", e.target.value)}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
          </select>
        </div>
        {text("nextAction", "Next action", "sm:col-span-2")}
        <div>
          <label className="label">Next action date</label>
          <input className="input" type="date" value={(d.nextActionDate as string) ?? ""} onChange={(e) => set("nextActionDate", e.target.value || null)} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Pros</label>
          <textarea className="textarea" rows={3} value={d.pros ?? ""} onChange={(e) => set("pros", e.target.value)} />
        </div>
        <div>
          <label className="label">Cons</label>
          <textarea className="textarea" rows={3} value={d.cons ?? ""} onChange={(e) => set("cons", e.target.value)} />
        </div>
      </div>
    </section>
  );
}
