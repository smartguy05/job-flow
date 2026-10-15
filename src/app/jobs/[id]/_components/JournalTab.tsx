"use client";

import { useState } from "react";
import { api } from "@/lib/ui";
import { JOURNAL_KIND_LABELS } from "@/lib/job-labels";
import { SmallButton, Status, muted, rowBorder, useActions, type Entry, type TabProps } from "./shared";

const EMPTY_ENTRY = { kind: "achievement", entryDate: "", title: "", body: "", impact: "", technologies: "" };
type EntryForm = typeof EMPTY_ENTRY;

const toForm = (e: Entry): EntryForm => ({
  kind: e.kind,
  entryDate: e.entryDate ?? "",
  title: e.title,
  body: e.body,
  impact: e.impact ?? "",
  technologies: e.technologies.join(", "),
});

function EntryFields({ value, onChange }: { value: EntryForm; onChange: (v: EntryForm) => void }) {
  return (
    <>
      <select className="select" value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value })}>
        {Object.entries(JOURNAL_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <input type="date" className="input" value={value.entryDate} onChange={(e) => onChange({ ...value, entryDate: e.target.value })} />
      <input className="input" placeholder="Title" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
      <textarea className="textarea sm:col-span-3" rows={2} placeholder="Details" value={value.body}
        onChange={(e) => onChange({ ...value, body: e.target.value })} />
      {value.kind === "achievement" && (
        <input className="input" placeholder="Impact (e.g. cut costs 30%)" value={value.impact}
          onChange={(e) => onChange({ ...value, impact: e.target.value })} />
      )}
      <input className={`input ${value.kind === "achievement" ? "sm:col-span-2" : "sm:col-span-3"}`}
        placeholder="Technologies used (comma-separated)" value={value.technologies}
        onChange={(e) => onChange({ ...value, technologies: e.target.value })} />
    </>
  );
}

const privateHint = (kind: string) =>
  (kind === "complaint" || kind === "note") && (
    <span className="text-xs" style={muted}>Private: never added to your career profile, brag doc or AI drafts.</span>
  );

export function JournalTab({ id, d, reload }: TabProps) {
  const [entry, setEntry] = useState(EMPTY_ENTRY);
  const [editing, setEditing] = useState<{ id: number; form: EntryForm } | null>(null);
  const [filter, setFilter] = useState("");
  const { busy, err, msg, run } = useActions(reload);

  const addEntry = () =>
    run("entry", async () => {
      await api(`/api/jobs/${id}/journal`, { method: "POST", body: JSON.stringify(entry) });
      setEntry({ ...EMPTY_ENTRY, kind: entry.kind });
    });
  const saveEdit = () =>
    editing &&
    run("entry-edit", async () => {
      await api(`/api/journal/${editing.id}`, { method: "PATCH", body: JSON.stringify(editing.form) });
      setEditing(null);
    }, "Entry saved.");
  const delEntry = (entryId: number) => run(`entry-${entryId}`, () => api(`/api/journal/${entryId}`, { method: "DELETE" }));

  const entries = d.entries.filter((e) => !filter || e.kind === filter);

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-semibold">Work journal</h2>
        <select className="select" style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All entries</option>
          {Object.entries(JOURNAL_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <Status err={err} msg={msg} />
      <div className="rounded-md border p-3 mb-4 grid gap-2 sm:grid-cols-3" style={{ borderColor: "var(--accent)" }}>
        <EntryFields value={entry} onChange={setEntry} />
        <div className="sm:col-span-3 flex items-center gap-3">
          <button className="btn btn-primary" disabled={busy === "entry" || !entry.title.trim()} onClick={addEntry}>
            {busy === "entry" ? "Adding…" : "Add entry"}
          </button>
          {privateHint(entry.kind)}
        </div>
      </div>
      {entries.length === 0 && <p className="text-sm" style={muted}>No entries yet.</p>}
      <div className="flex flex-col gap-2">
        {entries.map((e) =>
          editing?.id === e.id ? (
            <div key={e.id} className="rounded-md border p-3 grid gap-2 sm:grid-cols-3" style={{ borderColor: "var(--accent)" }}>
              <EntryFields value={editing.form} onChange={(form) => setEditing({ ...editing, form })} />
              <div className="sm:col-span-3 flex items-center gap-2">
                <button className="btn btn-primary" disabled={busy === "entry-edit" || !editing.form.title.trim()} onClick={saveEdit}>
                  {busy === "entry-edit" ? "Saving…" : "Save"}
                </button>
                <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                {privateHint(editing.form.kind)}
              </div>
            </div>
          ) : (
            <div key={e.id} className="rounded-md border p-3" style={rowBorder}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="badge mr-2" style={{ background: "var(--surface-2)" }}>{JOURNAL_KIND_LABELS[e.kind] ?? e.kind}</span>
                  <span className="font-semibold">{e.title}</span>
                  <span style={muted}> · {e.entryDate ?? "—"}</span>
                  {(e.kind === "achievement" || e.kind === "feedback") && !e.syncedAt && (
                    <span className="badge ml-2" style={{ background: "#fef3c7", color: "#92400e" }}>not in profile</span>
                  )}
                </div>
                <div className="flex gap-3">
                  <SmallButton onClick={() => setEditing({ id: e.id, form: toForm(e) })}>edit</SmallButton>
                  <SmallButton danger onClick={() => delEntry(e.id)}>delete</SmallButton>
                </div>
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
          ),
        )}
      </div>
    </section>
  );
}
