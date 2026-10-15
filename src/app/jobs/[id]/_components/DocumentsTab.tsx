"use client";

import { useState } from "react";
import { api, fmtRelative } from "@/lib/ui";
import { DOCX_MIME, JOB_FILE_KINDS, PDF_MIME } from "@/lib/job-files";
import { JOB_FILE_KIND_LABELS } from "@/lib/job-labels";
import { Status, muted, useActions, useList } from "./shared";

type JobFile = { id: number; kind: string; name: string; mimeType: string; size: number; createdAt: string };

// Offer letter, handbook, contract, reviews and misc documents for a job. Stored for
// download only — never sent to the AI.
export function DocumentsTab({ id }: { id: string }) {
  const base = `/api/jobs/${id}/files`;
  const [files, refresh] = useList<JobFile>(base);
  const [kind, setKind] = useState<string>("offer_letter");
  const { busy, err, msg, run } = useActions(refresh);

  const upload = (file: File) =>
    run("upload", async () => {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kind);
      const res = await fetch(base, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Upload failed");
    }, "Uploaded.");
  const del = (fileId: number) => {
    if (!confirm("Delete this document?")) return;
    run(`del-${fileId}`, () => api(`${base}/${fileId}`, { method: "DELETE" }));
  };

  const groups = JOB_FILE_KINDS.map((k) => ({ kind: k, items: files.filter((f) => f.kind === k) })).filter((g) => g.items.length);

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="font-semibold">Documents</h2>
        <div className="flex items-center gap-2">
          <select className="select text-sm" style={{ width: "auto" }} value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy === "upload"}>
            {JOB_FILE_KINDS.map((k) => <option key={k} value={k}>{JOB_FILE_KIND_LABELS[k]}</option>)}
          </select>
          <label className="btn btn-ghost cursor-pointer" style={{ opacity: busy === "upload" ? 0.5 : 1 }}>
            {busy === "upload" ? "Uploading…" : "+ Upload"}
            <input type="file" accept={`.pdf,.docx,${PDF_MIME},${DOCX_MIME}`} className="hidden" disabled={busy === "upload"}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          </label>
        </div>
      </div>
      <p className="text-xs mb-3" style={muted}>
        Offer letters, handbooks, contracts, reviews and other paperwork (PDF or Word, up to 10MB). Stored for download only — never sent to the AI.
      </p>
      <Status err={err} msg={msg} />
      {files.length === 0 ? (
        <p className="text-sm" style={muted}>No documents uploaded.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.kind} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={muted}>{JOB_FILE_KIND_LABELS[g.kind]}</h3>
              {g.items.map((f) => (
                <div key={f.id} className="flex items-center justify-between p-3 rounded-md" style={{ background: "var(--surface-2)" }}>
                  <div>
                    <a className="font-medium underline" style={{ color: "var(--accent)" }} href={`${base}/${f.id}?inline=1`} target="_blank" rel="noreferrer">
                      {f.name}
                    </a>
                    <div className="text-xs" style={muted}>
                      {(f.size / 1024).toFixed(0)} KB · {fmtRelative(f.createdAt)} · <a className="underline" href={`${base}/${f.id}`}>download</a>
                    </div>
                  </div>
                  <button className="btn btn-ghost text-xs" onClick={() => del(f.id)}>Delete</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
