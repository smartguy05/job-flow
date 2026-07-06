"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { JobDetailsPanel } from "@/components/JobDetailsPanel";
import { api, fmtDate, fmtRelative, STATUS_LABELS, STATUS_ORDER } from "@/lib/ui";
import { formatPay, type JobDetails } from "@/lib/job-fields";

type Detail = {
  id: number;
  company: string;
  roleTitle: string;
  link: string | null;
  status: string;
  notes: string | null;
  jdSnapshot: string | null;
  appliedAt: string | null;
  contact: { id: number; name: string; agency: string | null; email: string | null } | null;
  resumes: {
    id: number; version: number; status: string; pageCount: number | null;
    fitWarning: string | null; sentAt: string | null; createdAt: string; hasDocx: boolean; hasPdf: boolean;
  }[];
  interviews: {
    id: number; scheduledAt: string | null; round: string | null; interviewer: string | null;
    prepNotes: string | null; outcome: string | null;
  }[];
  drafts: { id: number; type: string; content: string; createdAt: string }[];
  events: { id: number; type: string; detail: string | null; createdAt: string }[];
} & Partial<JobDetails>;

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [generating, setGenerating] = useState(search.get("generating") === "1");
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    const data = await api<Detail>(`/api/applications/${id}`);
    setD(data);
    setNotes(data.notes ?? "");
    return data;
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Poll while a resume generation is in flight (kicked off from capture).
  useEffect(() => {
    if (!generating) return;
    const iv = setInterval(async () => {
      const data = await load();
      if (data.resumes.length > 0) {
        setGenerating(false);
        router.replace(`/applications/${id}`);
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [generating, load, id, router]);

  async function changeStatus(status: string) {
    await api(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
  }

  async function saveNotes() {
    setBusy("notes");
    await api(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify({ notes }) });
    setBusy("");
    load();
  }

  async function generate() {
    setBusy("generate");
    try {
      await api(`/api/applications/${id}/generate`, { method: "POST" });
      await load();
    } finally {
      setBusy("");
    }
  }

  async function genDraft(type: string) {
    setBusy(`draft-${type}`);
    try {
      await api(`/api/applications/${id}/drafts`, { method: "POST", body: JSON.stringify({ type }) });
      await load();
    } finally {
      setBusy("");
    }
  }

  async function del() {
    if (!confirm("Delete this application and all its resumes? This cannot be undone.")) return;
    await api(`/api/applications/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (!d) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/" className="text-sm hover:underline" style={{ color: "var(--muted)" }}>← All applications</Link>
        <div className="flex items-start justify-between mt-2 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{d.company || "(Company TBD)"}</h1>
            <p className="text-lg" style={{ color: "var(--muted)" }}>{d.roleTitle}</p>
            {d.link && (
              <a href={d.link} target="_blank" rel="noreferrer" className="text-sm underline" style={{ color: "var(--accent)" }}>
                View posting ↗
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select className="select" style={{ width: "auto" }} value={d.status}
              onChange={(e) => changeStatus(e.target.value)}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <button className="btn btn-danger" onClick={del}>Delete</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mt-2 text-sm" style={{ color: "var(--muted)" }}>
          <span>Applied: {fmtDate(d.appliedAt)}</span>
          {formatPay(d) && <span>Pay: {formatPay(d)}</span>}
          {d.locationMode && <span>{d.locationMode}{d.location ? ` · ${d.location}` : ""}</span>}
          {d.interestRating ? <span>Interest: {"★".repeat(d.interestRating)}</span> : null}
          {d.contact && <span>Contact: {d.contact.name}{d.contact.agency ? ` (${d.contact.agency})` : ""}{d.contact.email ? ` · ${d.contact.email}` : ""}</span>}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 flex flex-col gap-6">
          <JobDetailsPanel applicationId={d.id} initial={d} onSaved={load} />

          {/* Resumes */}
          <section className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-lg">Resumes</h2>
              <button className="btn btn-primary" disabled={busy === "generate" || generating} onClick={generate}>
                {busy === "generate" || generating ? "Generating…" : "+ Generate new version"}
              </button>
            </div>
            {generating && d.resumes.length === 0 && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Tailoring your resume and rendering to PDF/DOCX — this takes a moment…
              </p>
            )}
            {d.resumes.length === 0 && !generating && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>No resumes yet.</p>
            )}
            <div className="flex flex-col gap-2">
              {d.resumes.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-md" style={{ background: "var(--surface-2)" }}>
                  <div>
                    <span className="font-semibold">v{r.version}</span>
                    <span className="badge ml-2" style={{ background: r.status === "final" ? "#d1fae5" : "#e2e8f0", color: r.status === "final" ? "#065f46" : "#334155" }}>
                      {r.status}
                    </span>
                    {r.pageCount != null && (
                      <span className="ml-2 text-xs" style={{ color: r.pageCount === 2 ? "var(--muted)" : "var(--danger)" }}>
                        {r.pageCount} pages
                      </span>
                    )}
                    {r.sentAt && <span className="ml-2 text-xs" style={{ color: "var(--success)" }}>sent {fmtDate(r.sentAt)}</span>}
                    <div className="text-xs" style={{ color: "var(--muted)" }}>{fmtRelative(r.createdAt)}</div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Link href={`/resumes/${r.id}`} className="btn btn-ghost">Edit / refine</Link>
                    {r.hasPdf && <a className="btn btn-ghost" href={`/api/resumes/${r.id}/download?fmt=pdf`}>PDF</a>}
                    {r.hasDocx && <a className="btn btn-ghost" href={`/api/resumes/${r.id}/download?fmt=docx`}>DOCX</a>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Drafts */}
          <section className="card p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-semibold text-lg">Messages & cover letters</h2>
              <div className="flex gap-2">
                <button className="btn btn-ghost" disabled={!!busy} onClick={() => genDraft("reply")}>
                  {busy === "draft-reply" ? "…" : "Recruiter reply"}
                </button>
                <button className="btn btn-ghost" disabled={!!busy} onClick={() => genDraft("cover_letter")}>
                  {busy === "draft-cover_letter" ? "…" : "Cover letter"}
                </button>
                <button className="btn btn-ghost" disabled={!!busy} onClick={() => genDraft("follow_up")}>
                  {busy === "draft-follow_up" ? "…" : "Follow-up"}
                </button>
              </div>
            </div>
            {d.drafts.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>No drafts yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {d.drafts.map((dr) => (
                  <div key={dr.id} className="p-3 rounded-md" style={{ background: "var(--surface-2)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="badge" style={{ background: "#e2e8f0", color: "#334155" }}>{dr.type.replace("_", " ")}</span>
                      <button className="text-xs underline" style={{ color: "var(--accent)" }}
                        onClick={() => navigator.clipboard.writeText(dr.content)}>Copy</button>
                    </div>
                    <pre className="text-sm whitespace-pre-wrap font-sans">{dr.content}</pre>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Interviews */}
          <InterviewSection applicationId={d.id} interviews={d.interviews} onChange={load} />
        </div>

        {/* Sidebar: notes + timeline */}
        <div className="flex flex-col gap-6">
          <section className="card p-5">
            <h2 className="font-semibold text-lg mb-2">Notes</h2>
            <textarea className="textarea" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <button className="btn btn-ghost mt-2" disabled={busy === "notes"} onClick={saveNotes}>
              {busy === "notes" ? "Saving…" : "Save notes"}
            </button>
          </section>

          <section className="card p-5">
            <h2 className="font-semibold text-lg mb-3">Timeline</h2>
            <div className="flex flex-col gap-3">
              {d.events.map((e) => (
                <div key={e.id} className="text-sm flex gap-2">
                  <span style={{ color: "var(--accent)" }}>•</span>
                  <div>
                    <div>{e.detail || e.type}</div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>{fmtRelative(e.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function InterviewSection({
  applicationId, interviews, onChange,
}: {
  applicationId: number;
  interviews: Detail["interviews"];
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [round, setRound] = useState("");
  const [when, setWhen] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [prep, setPrep] = useState("");

  async function add() {
    await api(`/api/applications/${applicationId}/interviews`, {
      method: "POST",
      body: JSON.stringify({ round, scheduledAt: when || null, interviewer, prepNotes: prep }),
    });
    setAdding(false); setRound(""); setWhen(""); setInterviewer(""); setPrep("");
    onChange();
  }

  async function setOutcome(iid: number, outcome: string) {
    await api(`/api/interviews/${iid}`, { method: "PATCH", body: JSON.stringify({ outcome }) });
    onChange();
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-lg">Interviews</h2>
        <button className="btn btn-ghost" onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "+ Add"}</button>
      </div>
      {adding && (
        <div className="grid grid-cols-2 gap-3 mb-4 p-3 rounded-md" style={{ background: "var(--surface-2)" }}>
          <input className="input" placeholder="Round (e.g. Technical)" value={round} onChange={(e) => setRound(e.target.value)} />
          <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          <input className="input" placeholder="Interviewer" value={interviewer} onChange={(e) => setInterviewer(e.target.value)} />
          <input className="input" placeholder="Prep notes" value={prep} onChange={(e) => setPrep(e.target.value)} />
          <button className="btn btn-primary col-span-2" onClick={add}>Add interview</button>
        </div>
      )}
      {interviews.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>No interviews scheduled.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {interviews.map((iv) => (
            <div key={iv.id} className="p-3 rounded-md flex items-center justify-between" style={{ background: "var(--surface-2)" }}>
              <div>
                <div className="font-semibold">{iv.round || "Interview"}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {fmtDate(iv.scheduledAt)}{iv.interviewer ? ` · ${iv.interviewer}` : ""}
                </div>
                {iv.prepNotes && <div className="text-sm mt-1">{iv.prepNotes}</div>}
              </div>
              <select className="select" style={{ width: "auto" }} value={iv.outcome ?? "pending"}
                onChange={(e) => setOutcome(iv.id, e.target.value)}>
                {["pending", "passed", "failed", "cancelled"].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
