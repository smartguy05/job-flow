"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, fmtRelative, STATUS_LABELS } from "@/lib/ui";

type AppRow = { id: number; company: string; roleTitle: string; status: string };
type SavedComparison = {
  id: number;
  title: string | null;
  applicationIds: number[];
  priorities: string | null;
  createdAt: string;
};

export default function OffersPage() {
  const router = useRouter();
  const [apps, setApps] = useState<AppRow[]>([]);
  const [comparisons, setComparisons] = useState<SavedComparison[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [priorities, setPriorities] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const [a, c] = await Promise.all([
      api<AppRow[]>("/api/applications"),
      api<SavedComparison[]>("/api/offers/comparisons"),
    ]);
    setApps(a);
    setComparisons(c);
  }

  useEffect(() => { load(); }, []);

  function toggle(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function generate() {
    setError("");
    if (selected.length < 2) { setError("Select at least two applications to compare."); return; }
    setBusy(true);
    try {
      const res = await api<{ id: number }>("/api/offers/comparisons", {
        method: "POST",
        body: JSON.stringify({ applicationIds: selected, priorities: priorities || undefined, title: title || undefined }),
      });
      router.push(`/offers/${res.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function del(id: number) {
    if (!confirm("Delete this comparison?")) return;
    await api(`/api/offers/comparisons/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Offer comparison</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Compare competing offers side by side with an AI recommendation. Uploaded benefits
          paperwork (PDF) attached to any selected application is factored in automatically.
        </p>
      </div>

      {/* Builder */}
      <section className="card p-5">
        <h2 className="font-semibold text-lg mb-3">New comparison</h2>
        {apps.length < 2 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            You need at least two applications to compare. <Link href="/capture" className="underline" style={{ color: "var(--accent)" }}>Add one</Link>.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {apps.map((a) => {
                const on = selected.includes(a.id);
                return (
                  <button key={a.id} type="button" onClick={() => toggle(a.id)}
                    className="flex items-center gap-2 p-3 rounded-md text-left"
                    style={{ background: on ? "var(--surface-2)" : "transparent", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}` }}>
                    <input type="checkbox" readOnly checked={on} />
                    <div>
                      <div className="font-medium">{a.company || "(Company TBD)"}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {a.roleTitle} · {STATUS_LABELS[a.status] ?? a.status}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <input className="input mb-2" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="textarea mb-2" rows={2}
              placeholder="What matters most to you right now? (optional, e.g. 'comp > remote > growth')"
              value={priorities} onChange={(e) => setPriorities(e.target.value)} />
            {error && <p className="text-sm mb-2" style={{ color: "var(--danger)" }}>{error}</p>}
            <button className="btn btn-primary" disabled={busy} onClick={generate}>
              {busy ? "Comparing…" : `Compare ${selected.length || ""} offers`.trim()}
            </button>
          </>
        )}
      </section>

      {/* Saved comparisons */}
      <section className="card p-5">
        <h2 className="font-semibold text-lg mb-3">Saved comparisons</h2>
        {comparisons.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>No comparisons yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {comparisons.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-md" style={{ background: "var(--surface-2)" }}>
                <Link href={`/offers/${c.id}`} className="flex-1">
                  <div className="font-medium underline" style={{ color: "var(--accent)" }}>{c.title || `Comparison #${c.id}`}</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {c.applicationIds.length} offers · {fmtRelative(c.createdAt)}
                  </div>
                </Link>
                <button className="btn btn-ghost text-xs" onClick={() => del(c.id)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
