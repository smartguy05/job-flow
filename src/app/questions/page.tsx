"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/ui";

type Question = { id: number; text: string; sortOrder: number };

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const load = useCallback(async () => {
    const r = await api<{ questions: Question[] }>("/api/questions");
    setQuestions(r.questions);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api("/api/questions", { method: "POST", body: JSON.stringify({ text }) });
      setText("");
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(q: Question) {
    try {
      await api(`/api/questions/${q.id}`, { method: "PATCH", body: JSON.stringify({ text: editText }) });
      setEditId(null);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function del(q: Question) {
    if (!confirm("Delete this question? It will be removed from every job's checklist.")) return;
    await api(`/api/questions/${q.id}`, { method: "DELETE" });
    load();
  }

  async function move(index: number, dir: -1 | 1) {
    const a = questions[index];
    const b = questions[index + dir];
    if (!a || !b) return;
    // Swap sortOrder values; if they're equal, nudge so the swap still takes effect.
    const aOrder = a.sortOrder === b.sortOrder ? a.sortOrder + dir : b.sortOrder;
    await api(`/api/questions/${a.id}`, { method: "PATCH", body: JSON.stringify({ sortOrder: aOrder }) });
    await api(`/api/questions/${b.id}`, { method: "PATCH", body: JSON.stringify({ sortOrder: a.sortOrder }) });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Questions to ask</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          These general questions appear on every job&apos;s Questions checklist, to use during
          interviews. Job-specific questions are added from each job&apos;s own checklist.
        </p>
      </div>

      <section className="card p-4">
        <h2 className="font-semibold mb-3">Add question</h2>
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="e.g. What does success look like in the first 90 days?"
            value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={add}>Add</button>
        </div>
      </section>

      {questions.length === 0 ? (
        <div className="card p-4" style={{ color: "var(--muted)" }}>No general questions yet.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {questions.map((q, i) => (
            <li key={q.id} className="card p-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              {editId === q.id ? (
                <>
                  <input className="input flex-1" autoFocus value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(q); if (e.key === "Escape") setEditId(null); }} />
                  <div className="flex gap-2">
                    <button className="btn btn-primary" disabled={!editText.trim()} onClick={() => saveEdit(q)}>Save</button>
                    <button className="btn btn-ghost" onClick={() => setEditId(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex-1 break-words">{q.text}</div>
                  <div className="flex gap-1 items-center">
                    <button className="btn btn-ghost text-xs" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button className="btn btn-ghost text-xs" aria-label="Move down" disabled={i === questions.length - 1} onClick={() => move(i, 1)}>↓</button>
                    <button className="btn btn-ghost text-xs" onClick={() => { setEditId(q.id); setEditText(q.text); }}>Edit</button>
                    <button className="btn btn-ghost text-xs" onClick={() => del(q)}>Delete</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
