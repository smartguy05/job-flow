"use client";

import { useState } from "react";
import { api } from "@/lib/ui";
import { diffLines } from "@/lib/text-diff";

type Proposal = { current: string; proposed: string; entryIds: number[]; jobIds: number[] };

// "Propose profile update": asks the AI to fold employment history + unsynced journal wins
// into the career profile, shows a line diff for review, and saves only on approval.
export function ProfileSyncPanel({ jobIds, onSaved }: { jobIds?: number[]; onSaved?: (content: string) => void }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [p, setP] = useState<Proposal | null>(null);
  const [editing, setEditing] = useState(false);
  const [done, setDone] = useState("");

  async function propose() {
    setBusy("propose");
    setErr("");
    setDone("");
    try {
      setP(
        await api<Proposal>("/api/jobs/profile-sync", {
          method: "POST",
          body: JSON.stringify(jobIds ? { jobIds } : {}),
        }),
      );
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!p) return;
    setBusy("save");
    try {
      await api("/api/career-profile", { method: "PUT", body: JSON.stringify({ content: p.proposed }) });
      await api("/api/journal/mark-synced", {
        method: "POST",
        body: JSON.stringify({ entryIds: p.entryIds, jobIds: p.jobIds }),
      });
      onSaved?.(p.proposed);
      setP(null);
      setDone("Career profile updated.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={busy !== ""} onClick={propose}>
          {busy === "propose" ? "Drafting…" : "Propose profile update"}
        </button>
        {err && <span className="text-sm" style={{ color: "var(--danger)" }}>{err}</span>}
        {done && <span className="text-sm" style={{ color: "var(--success)" }}>{done}</span>}
      </div>
      {p && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <label className="label">Proposed changes — review before saving</label>
            <button className="text-sm hover:underline" style={{ color: "var(--accent)" }} onClick={() => setEditing(!editing)}>
              {editing ? "Show diff" : "Edit text"}
            </button>
          </div>
          {editing ? (
            <textarea className="textarea font-mono" style={{ fontSize: "0.8rem" }} rows={16} value={p.proposed}
              onChange={(e) => setP({ ...p, proposed: e.target.value })} />
          ) : (
            <pre className="rounded-md border p-2 overflow-auto max-h-[50vh] text-xs whitespace-pre-wrap"
              style={{ borderColor: "var(--border)" }}>
              {diffLines(p.current, p.proposed).map((l, i) => (
                <div key={i} style={{
                  background: l.type === "add" ? "rgba(47,133,90,0.15)" : l.type === "del" ? "rgba(197,48,48,0.15)" : undefined,
                  color: l.type === "same" ? "var(--muted)" : undefined,
                }}>
                  {l.type === "add" ? "+ " : l.type === "del" ? "- " : "  "}{l.text}
                </div>
              ))}
            </pre>
          )}
          <div className="flex gap-2 mt-2">
            <button className="btn btn-primary" disabled={busy !== ""} onClick={save}>
              {busy === "save" ? "Saving…" : "Save to profile"}
            </button>
            <button className="btn btn-ghost" onClick={() => setP(null)}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
