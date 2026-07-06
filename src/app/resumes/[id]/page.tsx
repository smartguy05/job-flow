"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, fmtDate } from "@/lib/ui";
import type { ResumeContent, ChatMessage } from "@/lib/resume-content";

type Resume = {
  id: number;
  applicationId: number;
  version: number;
  status: string;
  pageCount: number | null;
  fitWarning: string | null;
  sentAt: string | null;
  content: ResumeContent;
  chat: ChatMessage[];
};

export default function ResumeEditor() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<Resume | null>(null);
  const [content, setContent] = useState<ResumeContent | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pdfKey, setPdfKey] = useState(0);

  const load = useCallback(async () => {
    const data = await api<Resume>(`/api/resumes/${id}`);
    setR(data);
    setContent(data.content);
    setPdfKey((k) => k + 1);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function refine() {
    if (!feedback.trim()) return;
    setBusy("refine");
    setError("");
    try {
      const data = await api<Resume>(`/api/resumes/${id}/refine`, {
        method: "POST",
        body: JSON.stringify({ feedback }),
      });
      setR(data);
      setContent(data.content);
      setFeedback("");
      setPdfKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function saveEdits() {
    if (!content) return;
    setBusy("save");
    setError("");
    try {
      const data = await api<Resume>(`/api/resumes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ content }),
      });
      setR(data);
      setContent(data.content);
      setPdfKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function finalize() {
    setBusy("finalize");
    const data = await api<Resume>(`/api/resumes/${id}`, { method: "PATCH", body: JSON.stringify({ status: "final" }) });
    setR(data);
    setBusy("");
  }

  async function markSent() {
    setBusy("sent");
    const data = await api<Resume>(`/api/resumes/${id}`, { method: "PATCH", body: JSON.stringify({ markSent: true }) });
    setR(data);
    setBusy("");
  }

  if (!r || !content) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  const working = busy === "refine" || busy === "save";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Link href={`/applications/${r.applicationId}`} className="text-sm hover:underline" style={{ color: "var(--muted)" }}>
            ← Back to application
          </Link>
          <h1 className="text-2xl font-bold mt-1">Resume v{r.version}</h1>
        </div>
        <div className="flex items-center gap-2">
          {r.pageCount != null && (
            <span className="badge" style={{ background: r.pageCount === 2 ? "#d1fae5" : "#fee2e2", color: r.pageCount === 2 ? "#065f46" : "#991b1b" }}>
              {r.pageCount} pages
            </span>
          )}
          <a className="btn btn-ghost" href={`/api/resumes/${r.id}/download?fmt=pdf`}>Download PDF</a>
          <a className="btn btn-ghost" href={`/api/resumes/${r.id}/download?fmt=docx`}>Download DOCX</a>
          <button className="btn btn-ghost" disabled={busy === "finalize" || r.status === "final"} onClick={finalize}>
            {r.status === "final" ? "Finalized" : "Mark final"}
          </button>
          <button className="btn btn-primary" disabled={busy === "sent"} onClick={markSent}>
            {r.sentAt ? `Sent ${fmtDate(r.sentAt)}` : "Mark as sent"}
          </button>
        </div>
      </div>

      {r.fitWarning && (
        <div className="card p-3 text-sm" style={{ borderColor: "var(--warning)", color: "var(--warning)" }}>
          {r.fitWarning} Try refining with feedback like "condense the older roles" or "expand my summary".
        </div>
      )}
      {error && <div className="card p-3" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{error}</div>}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Left: PDF preview */}
        <div className="card overflow-hidden" style={{ height: "80vh", position: "sticky", top: 70 }}>
          <iframe
            key={pdfKey}
            src={`/api/resumes/${r.id}/download?fmt=pdf&inline=1#toolbar=0`}
            className="w-full h-full"
            title="Resume preview"
          />
        </div>

        {/* Right: refine + edit */}
        <div className="flex flex-col gap-4">
          <section className="card p-4">
            <h2 className="font-semibold mb-2">Refine with AI</h2>
            {r.chat.length > 0 && (
              <div className="flex flex-col gap-2 mb-3 max-h-48 overflow-y-auto">
                {r.chat.map((m, i) => (
                  <div key={i} className="text-sm p-2 rounded-md"
                    style={{ background: m.role === "user" ? "var(--surface-2)" : "transparent",
                             borderLeft: m.role === "assistant" ? "3px solid var(--accent)" : "none",
                             paddingLeft: m.role === "assistant" ? "0.5rem" : undefined }}>
                    <span className="font-semibold" style={{ color: "var(--muted)" }}>{m.role === "user" ? "You" : "AI"}: </span>
                    {m.content}
                  </div>
                ))}
              </div>
            )}
            <textarea className="textarea" rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)}
              placeholder='e.g. "Lead with my AI work", "Cut the casino role", "Make the Why-Company more specific to their product"' />
            <button className="btn btn-primary mt-2" disabled={working || !feedback.trim()} onClick={refine}>
              {busy === "refine" ? "Applying & re-rendering…" : "Apply feedback"}
            </button>
          </section>

          <section className="card p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Edit directly</h2>
              <button className="btn btn-primary" disabled={working} onClick={saveEdits}>
                {busy === "save" ? "Saving & re-rendering…" : "Save & re-render"}
              </button>
            </div>

            <Field label="Subtitle" value={content.contact.subtitle}
              onChange={(v) => setContent({ ...content, contact: { ...content.contact, subtitle: v } })} />
            <Field label="Professional summary" textarea value={content.summary}
              onChange={(v) => setContent({ ...content, summary: v })} />

            <div>
              <label className="label">Skills</label>
              {content.skills.map((s, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input className="input" style={{ maxWidth: 140 }} value={s.category}
                    onChange={(e) => {
                      const skills = [...content.skills];
                      skills[i] = { ...s, category: e.target.value };
                      setContent({ ...content, skills });
                    }} />
                  <input className="input" value={s.skills}
                    onChange={(e) => {
                      const skills = [...content.skills];
                      skills[i] = { ...s, skills: e.target.value };
                      setContent({ ...content, skills });
                    }} />
                </div>
              ))}
            </div>

            <div>
              <label className="label">Experience bullets</label>
              {content.jobs.map((job, ji) => (
                <div key={ji} className="mb-3 p-2 rounded-md" style={{ background: "var(--surface-2)" }}>
                  <div className="text-sm font-semibold mb-1">{job.title} — {job.company}</div>
                  {job.bullets.map((b, bi) => (
                    <textarea key={bi} className="textarea mb-1" rows={2} value={b}
                      onChange={(e) => {
                        const jobs = [...content.jobs];
                        const bullets = [...job.bullets];
                        bullets[bi] = e.target.value;
                        jobs[ji] = { ...job, bullets };
                        setContent({ ...content, jobs });
                      }} />
                  ))}
                </div>
              ))}
            </div>

            <Field label={`Why-Company heading`} value={content.whyCompany.heading}
              onChange={(v) => setContent({ ...content, whyCompany: { ...content.whyCompany, heading: v } })} />
            <Field label="Why-Company body" textarea value={content.whyCompany.body}
              onChange={(v) => setContent({ ...content, whyCompany: { ...content.whyCompany, body: v } })} />
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, textarea }: {
  label: string; value: string; onChange: (v: string) => void; textarea?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {textarea ? (
        <textarea className="textarea" rows={4} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
