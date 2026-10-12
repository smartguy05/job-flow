"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, fmtDate } from "@/lib/ui";
import type { ChecklistItem } from "@/lib/interview-questions";

type PrepPack = { interviewId: number; round: string | null; scheduledAt: string | null; count: number };
type Payload = {
  application: { id: number; company: string; roleTitle: string };
  items: ChecklistItem[];
  prepPacks: PrepPack[];
};

// Unchecked first in server (original) order, checked at the bottom in check order.
function sortItems(items: ChecklistItem[], order: number[]): ChecklistItem[] {
  const idx = (id: number) => order.indexOf(id);
  const unchecked = items.filter((i) => !i.checked).sort((a, b) => idx(a.id) - idx(b.id));
  const checked = items
    .filter((i) => i.checked)
    .sort((a, b) => (a.checkedAt ?? "").localeCompare(b.checkedAt ?? "") || idx(a.id) - idx(b.id));
  return [...unchecked, ...checked];
}

export default function QuestionChecklist() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [packId, setPackId] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const p = await api<Payload>(`/api/applications/${id}/questions`);
      setData(p);
      setOrder(p.items.map((i) => i.id));
      setItems(sortItems(p.items, p.items.map((i) => i.id)));
      setPackId((cur) => cur || (p.prepPacks[0] ? String(p.prepPacks[0].interviewId) : ""));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function toggle(item: ChecklistItem) {
    const checked = !item.checked;
    const next = items.map((i) =>
      i.id === item.id ? { ...i, checked, checkedAt: checked ? new Date().toISOString() : null } : i,
    );
    setItems(sortItems(next, order));
    try {
      await api(`/api/applications/${id}/questions/${item.id}`, { method: "PUT", body: JSON.stringify({ checked }) });
    } catch {
      load();
    }
  }

  async function saveNotes(item: ChecklistItem, notes: string) {
    if (notes === item.notes) return;
    setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, notes } : i)));
    try {
      await api(`/api/applications/${id}/questions/${item.id}`, { method: "PUT", body: JSON.stringify({ notes }) });
    } catch {
      load();
    }
  }

  async function addQuestion() {
    const text = newText.trim();
    if (!text) return;
    try {
      await api(`/api/applications/${id}/questions`, { method: "POST", body: JSON.stringify({ text }) });
      setNewText("");
      setAdding(false);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function reset() {
    if (!confirm("Uncheck all questions for this job? Your notes are kept.")) return;
    await api(`/api/applications/${id}/questions`, { method: "DELETE" });
    load();
  }

  async function remove(item: ChecklistItem) {
    if (!confirm("Delete this question?")) return;
    await api(`/api/questions/${item.id}`, { method: "DELETE" });
    load();
  }

  async function importPack() {
    if (!packId) return;
    try {
      const r = await api<{ added: number }>(`/api/applications/${id}/questions/import`, {
        method: "POST",
        body: JSON.stringify({ interviewId: Number(packId) }),
      });
      setMsg(r.added === 0 ? "No new questions to add." : `Added ${r.added} question${r.added === 1 ? "" : "s"}.`);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (error && !data) return <p style={{ color: "var(--danger)" }}>{error}</p>;
  if (!data) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  const asked = items.filter((i) => i.checked).length;

  return (
    <div className="flex flex-col gap-5 max-w-3xl mx-auto">
      <div>
        <Link href={`/applications/${id}`} className="text-sm hover:underline" style={{ color: "var(--muted)" }}>
          ← Back to job
        </Link>
        <h1 className="text-2xl font-bold mt-2">{data.application.company || "(Company TBD)"}</h1>
        <p className="text-lg" style={{ color: "var(--muted)" }}>{data.application.roleTitle}</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-lg font-semibold mr-auto">{asked} / {items.length} asked</span>
        <button className="btn btn-primary" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ Add question"}
        </button>
        <button className="btn btn-ghost" onClick={reset} disabled={asked === 0}>Reset checks</button>
      </div>

      {adding && (
        <div className="flex gap-2">
          <input className="input flex-1" autoFocus placeholder="Question to ask…" value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addQuestion(); }} />
          <button className="btn btn-primary" disabled={!newText.trim()} onClick={addQuestion}>Add</button>
        </div>
      )}

      {data.prepPacks.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {data.prepPacks.length > 1 && (
            <select className="select" style={{ width: "auto" }} value={packId} onChange={(e) => setPackId(e.target.value)}>
              {data.prepPacks.map((p) => (
                <option key={p.interviewId} value={p.interviewId}>
                  {p.round || "Interview"}{p.scheduledAt ? ` · ${fmtDate(p.scheduledAt)}` : ""} ({p.count})
                </option>
              ))}
            </select>
          )}
          <button className="btn btn-ghost" onClick={importPack}>Import from prep pack</button>
          {msg && <span className="text-sm" style={{ color: "var(--success)" }}>{msg}</span>}
        </div>
      )}

      {items.length === 0 ? (
        <div className="card p-4" style={{ color: "var(--muted)" }}>
          No questions yet. Add one above, or{" "}
          <Link href="/questions" className="underline" style={{ color: "var(--accent)" }}>
            add general questions
          </Link>{" "}
          that apply to every job.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <ChecklistRow key={item.id} item={item} onToggle={toggle} onNotes={saveNotes} onDelete={remove} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ChecklistRow({
  item, onToggle, onNotes, onDelete,
}: {
  item: ChecklistItem;
  onToggle: (i: ChecklistItem) => void;
  onNotes: (i: ChecklistItem, notes: string) => void;
  onDelete: (i: ChecklistItem) => void;
}) {
  const [notes, setNotes] = useState(item.notes);
  const [showNotes, setShowNotes] = useState(!!item.notes);
  useEffect(() => { setNotes(item.notes); }, [item.notes]);

  return (
    <li className="card p-4 flex flex-col gap-2" style={{ opacity: item.checked ? 0.6 : 1 }}>
      <div className="flex items-start gap-4">
        <input type="checkbox" checked={item.checked} onChange={() => onToggle(item)}
          aria-label="Mark as asked" className="shrink-0 mt-1"
          style={{ width: 32, height: 32, accentColor: "var(--accent)" }} />
        <div className="flex-1 min-w-0">
          <div className="text-xl leading-snug break-words"
            style={{ textDecoration: item.checked ? "line-through" : "none" }}>
            {item.text}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="badge" style={{ background: "#e2e8f0", color: "#334155" }}>
              {item.source === "general" ? "General" : "This job"}
            </span>
            {!showNotes && (
              <button className="text-sm underline" style={{ color: "var(--accent)" }} onClick={() => setShowNotes(true)}>
                + Notes
              </button>
            )}
            {item.source === "job" && (
              <button className="text-sm underline" style={{ color: "var(--muted)" }} onClick={() => onDelete(item)}>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
      {showNotes && (
        <textarea className="textarea text-base" rows={2} placeholder="Notes / their answer…" value={notes}
          onChange={(e) => setNotes(e.target.value)} onBlur={() => onNotes(item, notes)} />
      )}
    </li>
  );
}
