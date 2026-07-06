"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, fmtDate, STATUS_LABELS } from "@/lib/ui";
import { LOCATION_MODES, EMPLOYMENT_TYPES, PAY_PERIODS, type JobDetails } from "@/lib/job-fields";

type Extracted = {
  company: string;
  roleTitle: string;
  link: string | null;
  jdSnapshot: string;
  contactName: string | null;
  contactAgency: string | null;
  contactEmail: string | null;
} & Partial<JobDetails>;

type Duplicate = {
  id: number;
  company: string;
  roleTitle: string;
  status: string;
  daysAgo: number;
  similarity: number;
};

export default function CapturePage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [companyHint, setCompanyHint] = useState("");
  const [contactHint, setContactHint] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");

  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [windowDays, setWindowDays] = useState(30);

  // editable review fields
  const [form, setForm] = useState<Extracted | null>(null);
  const [genResume, setGenResume] = useState(true);
  const [markApplied, setMarkApplied] = useState(true);
  const [saving, setSaving] = useState(false);

  async function extract() {
    setExtracting(true);
    setError("");
    try {
      const res = await api<{ extracted: Extracted; duplicates: Duplicate[]; dedupWindowDays: number }>(
        "/api/capture",
        { method: "POST", body: JSON.stringify({ text, companyHint, contactHint }) },
      );
      setExtracted(res.extracted);
      setForm(res.extracted);
      setDuplicates(res.duplicates);
      setWindowDays(res.dedupWindowDays);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExtracting(false);
    }
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const { id } = await api<{ id: number }>("/api/applications", {
        method: "POST",
        body: JSON.stringify({ ...form, sourceRaw: text, markApplied }),
      });
      if (genResume) {
        // Fire generation, then route to detail (generation continues server-side).
        api(`/api/applications/${id}/generate`, { method: "POST" }).catch(() => {});
      }
      router.push(`/applications/${id}${genResume ? "?generating=1" : ""}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  function upd(field: keyof Extracted, value: string | number | null) {
    setForm((f) => (f ? { ...f, [field]: value } : f));
  }

  function updNum(field: keyof Extracted, value: string) {
    upd(field, value === "" ? null : Number(value));
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <h1 className="text-2xl font-bold">New application</h1>

      {error && <div className="card p-3" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{error}</div>}

      {!extracted && (
        <div className="card p-5 flex flex-col gap-4">
          <div>
            <label className="label">Recruiter message, job description, or link</label>
            <textarea className="textarea" rows={10} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Paste the recruiter's message, the full job description, or a job posting URL…" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Company (optional — if not in the text)</label>
              <input className="input" value={companyHint} onChange={(e) => setCompanyHint(e.target.value)} />
            </div>
            <div>
              <label className="label">Contact name (optional)</label>
              <input className="input" value={contactHint} onChange={(e) => setContactHint(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary self-start" disabled={!text.trim() || extracting} onClick={extract}>
            {extracting ? "Analyzing…" : "Analyze →"}
          </button>
        </div>
      )}

      {extracted && form && (
        <>
          {duplicates.length > 0 && (
            <div className="card p-4" style={{ borderColor: "var(--warning)", background: "var(--surface-2)" }}>
              <div className="font-semibold mb-2" style={{ color: "var(--warning)" }}>
                ⚠️ Possible duplicate — you may have already applied here within {windowDays} days
              </div>
              <ul className="text-sm flex flex-col gap-1">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    <Link href={`/applications/${d.id}`} className="underline" style={{ color: "var(--accent)" }}>
                      {d.company} — {d.roleTitle}
                    </Link>{" "}
                    <span style={{ color: "var(--muted)" }}>
                      · {STATUS_LABELS[d.status]} · {d.daysAgo}d ago · {Math.round(d.similarity * 100)}% role match
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card p-5 flex flex-col gap-4">
            <h2 className="font-semibold text-lg">Review & confirm</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Company (optional)</label>
                <input className="input" placeholder="e.g. TBD until recruiter says" value={form.company ?? ""} onChange={(e) => upd("company", e.target.value)} />
              </div>
              <div>
                <label className="label">Role title</label>
                <input className="input" value={form.roleTitle ?? ""} onChange={(e) => upd("roleTitle", e.target.value)} />
              </div>
              <div>
                <label className="label">Contact name</label>
                <input className="input" value={form.contactName ?? ""} onChange={(e) => upd("contactName", e.target.value)} />
              </div>
              <div>
                <label className="label">Contact agency</label>
                <input className="input" value={form.contactAgency ?? ""} onChange={(e) => upd("contactAgency", e.target.value)} />
              </div>
              <div>
                <label className="label">Contact email</label>
                <input className="input" value={form.contactEmail ?? ""} onChange={(e) => upd("contactEmail", e.target.value)} />
              </div>
              <div>
                <label className="label">Link</label>
                <input className="input" value={form.link ?? ""} onChange={(e) => upd("link", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Job description (used for tailoring)</label>
              <textarea className="textarea" rows={8} value={form.jdSnapshot ?? ""}
                onChange={(e) => upd("jdSnapshot", e.target.value)} />
            </div>

            <details open className="rounded-md" style={{ background: "var(--surface-2)", padding: "0.75rem 1rem" }}>
              <summary className="font-semibold cursor-pointer">Job details (auto-filled where found)</summary>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <div>
                  <label className="label">Pay min</label>
                  <input className="input" type="number" value={form.payMin ?? ""} onChange={(e) => updNum("payMin", e.target.value)} />
                </div>
                <div>
                  <label className="label">Pay max</label>
                  <input className="input" type="number" value={form.payMax ?? ""} onChange={(e) => updNum("payMax", e.target.value)} />
                </div>
                <div>
                  <label className="label">Currency</label>
                  <input className="input" value={form.payCurrency ?? ""} onChange={(e) => upd("payCurrency", e.target.value)} />
                </div>
                <div>
                  <label className="label">Period</label>
                  <select className="select" value={form.payPeriod ?? ""} onChange={(e) => upd("payPeriod", e.target.value || null)}>
                    <option value="">—</option>
                    {PAY_PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Bonus</label>
                  <input className="input" value={form.bonus ?? ""} onChange={(e) => upd("bonus", e.target.value)} />
                </div>
                <div className="col-span-2 md:col-span-3">
                  <label className="label">Benefits</label>
                  <input className="input" value={form.benefits ?? ""} onChange={(e) => upd("benefits", e.target.value)} />
                </div>
                <div>
                  <label className="label">Work mode</label>
                  <select className="select" value={form.locationMode ?? ""} onChange={(e) => upd("locationMode", e.target.value || null)}>
                    <option value="">—</option>
                    {LOCATION_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Location</label>
                  <input className="input" value={form.location ?? ""} onChange={(e) => upd("location", e.target.value)} />
                </div>
                <div>
                  <label className="label">Employment type</label>
                  <select className="select" value={form.employmentType ?? ""} onChange={(e) => upd("employmentType", e.target.value || null)}>
                    <option value="">—</option>
                    {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Seniority</label>
                  <input className="input" value={form.seniorityLevel ?? ""} onChange={(e) => upd("seniorityLevel", e.target.value)} />
                </div>
                <div className="col-span-2 md:col-span-4">
                  <label className="label">Tech stack (comma-separated)</label>
                  <input className="input" value={form.techStack ?? ""} onChange={(e) => upd("techStack", e.target.value)} />
                </div>
                <div>
                  <label className="label">Company size</label>
                  <input className="input" value={form.companySize ?? ""} onChange={(e) => upd("companySize", e.target.value)} />
                </div>
                <div>
                  <label className="label">Company stage</label>
                  <input className="input" value={form.companyStage ?? ""} onChange={(e) => upd("companyStage", e.target.value)} />
                </div>
                <div>
                  <label className="label">Industry</label>
                  <input className="input" value={form.industry ?? ""} onChange={(e) => upd("industry", e.target.value)} />
                </div>
                <div>
                  <label className="label">Source / channel</label>
                  <input className="input" value={form.sourceChannel ?? ""} onChange={(e) => upd("sourceChannel", e.target.value)} />
                </div>
                <div>
                  <label className="label">Date posted</label>
                  <input className="input" type="date" value={form.datePosted ?? ""} onChange={(e) => upd("datePosted", e.target.value || null)} />
                </div>
                <div>
                  <label className="label">Deadline</label>
                  <input className="input" type="date" value={form.applicationDeadline ?? ""} onChange={(e) => upd("applicationDeadline", e.target.value || null)} />
                </div>
                <div>
                  <label className="label">Posting / req ID</label>
                  <input className="input" value={form.postingId ?? ""} onChange={(e) => upd("postingId", e.target.value)} />
                </div>
                <div>
                  <label className="label">Referral name</label>
                  <input className="input" value={form.referralName ?? ""} onChange={(e) => upd("referralName", e.target.value)} />
                </div>
              </div>
            </details>

            <div className="flex flex-wrap gap-4 items-center">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={genResume} onChange={(e) => setGenResume(e.target.checked)} />
                Generate tailored resume now
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={markApplied} onChange={(e) => setMarkApplied(e.target.checked)} />
                Mark as applied today
              </label>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={saving} onClick={save}>
                {saving ? "Saving…" : genResume ? "Save & generate resume" : "Save application"}
              </button>
              <button className="btn btn-ghost" onClick={() => { setExtracted(null); setForm(null); }}>
                Back
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
