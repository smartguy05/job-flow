"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/ui";
import { INVENTION_KIND_LABELS } from "@/lib/job-labels";

type Invention = {
  id: number;
  title: string;
  description: string;
  inventionDate: string | null;
  identifier: string | null;
  kind: string;
  technologies: string[];
  includeInResume: boolean;
  notes: string | null;
};

// A draft from the AI (or a blank form) before it is saved.
type Draft = {
  title: string;
  description: string;
  inventionDate: string | null;
  identifier: string | null;
  kind: string;
  technologies: string[];
  includeInResume?: boolean;
  notes?: string | null;
  source?: string;
  ownershipCaution?: string | null;
  duplicate?: boolean;
};

const BLANK: Draft = { title: "", description: "", inventionDate: "", identifier: "", kind: "software", technologies: [] };
type Tab = "describe" | "repo" | "suggest" | "import";
const TABS: [Tab, string][] = [
  ["describe", "Describe it"],
  ["repo", "From GitHub repo"],
  ["suggest", "Suggest from my history"],
  ["import", "Import existing Exhibit A"],
];

function EntryForm({ value, onChange }: { value: Draft; onChange: (d: Draft) => void }) {
  const set = (patch: Partial<Draft>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Title</label>
        <input className="input" value={value.title} onChange={(e) => set({ title: e.target.value })} />
      </div>
      <div>
        <label className="label">Date (e.g. 2019 or 2019–2021)</label>
        <input className="input" value={value.inventionDate ?? ""} onChange={(e) => set({ inventionDate: e.target.value })} />
      </div>
      <div>
        <label className="label">Kind</label>
        <select className="select" value={value.kind} onChange={(e) => set({ kind: e.target.value })}>
          {Object.entries(INVENTION_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Identifying number (repo URL, patent / application no.)</label>
        <input className="input" value={value.identifier ?? ""} onChange={(e) => set({ identifier: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Brief description</label>
        <textarea className="textarea" rows={3} value={value.description} onChange={(e) => set({ description: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Technologies (comma-separated)</label>
        <input className="input" value={value.technologies.join(", ")}
          onChange={(e) => set({ technologies: e.target.value.split(",").map((t) => t.trimStart()) })} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Private notes (never exported)</label>
        <textarea className="textarea" rows={2} value={value.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={!!value.includeInResume} onChange={(e) => set({ includeInResume: e.target.checked })} />
        Include in resume generation
      </label>
    </div>
  );
}

// Fields the API accepts (drops AI-only keys like source / ownershipCaution / duplicate).
const toBody = (d: Draft) => ({
  title: d.title,
  description: d.description,
  inventionDate: d.inventionDate,
  identifier: d.identifier,
  kind: d.kind,
  technologies: d.technologies.filter((t) => t.trim()),
  includeInResume: !!d.includeInResume,
  notes: d.notes ?? null,
});

export default function InventionsPage() {
  const [items, setItems] = useState<Invention[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<{ id: number | null; draft: Draft } | null>(null);
  const [tab, setTab] = useState<Tab>("describe");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [suggestions, setSuggestions] = useState<Draft[] | null>(null);
  const [imported, setImported] = useState<Draft[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const apply = useCallback((rows: Invention[]) => {
    setItems(rows);
    setSelected(new Set(rows.map((r) => r.id)));
  }, []);
  const load = useCallback(() => api<Invention[]>("/api/inventions").then(apply), [apply]);
  useEffect(() => {
    api<Invention[]>("/api/inventions").then(apply);
  }, [apply]);

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    setErr("");
    try {
      await fn();
      if (ok) {
        setMsg(ok);
        setTimeout(() => setMsg(""), 2500);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const saveEditing = () =>
    run("save", async () => {
      if (!editing) return;
      const body = JSON.stringify(toBody(editing.draft));
      if (editing.id == null) await api("/api/inventions", { method: "POST", body });
      else await api(`/api/inventions/${editing.id}`, { method: "PATCH", body });
      setEditing(null);
      await load();
    }, "Saved.");

  const draftFrom = (body: Record<string, string>) =>
    run("draft", async () => {
      const { draft } = await api<{ draft: Draft }>("/api/inventions/draft", { method: "POST", body: JSON.stringify(body) });
      setEditing({ id: null, draft });
    });

  const suggest = () =>
    run("suggest", async () => {
      const r = await api<{ suggestions: Draft[] }>("/api/inventions/suggest", { method: "POST", body: "{}" });
      setSuggestions(r.suggestions);
    });

  const importParse = () =>
    run("import", async () => {
      let r: { inventions: Draft[] };
      if (file) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/inventions/import", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Import failed");
        r = data;
      } else {
        r = await api("/api/inventions/import", { method: "POST", body: JSON.stringify({ text }) });
      }
      setImported(r.inventions);
      setPicked(new Set(r.inventions.flatMap((d, i) => (d.duplicate ? [] : [i]))));
    });

  const importSave = () =>
    run("importSave", async () => {
      if (!imported) return;
      const chosen = imported.filter((_, i) => picked.has(i)).map(toBody);
      if (chosen.length) await api("/api/inventions", { method: "POST", body: JSON.stringify(chosen) });
      setImported(null);
      setText("");
      setFile(null);
      await load();
    }, "Imported.");

  const toggleResume = (inv: Invention) =>
    run(`resume-${inv.id}`, async () => {
      await api(`/api/inventions/${inv.id}`, { method: "PATCH", body: JSON.stringify({ includeInResume: !inv.includeInResume }) });
      await load();
    });

  const del = (inv: Invention) =>
    run(`del-${inv.id}`, async () => {
      if (!confirm(`Delete "${inv.title}"?`)) return;
      await api(`/api/inventions/${inv.id}`, { method: "DELETE" });
      await load();
    });

  const idsParam = items && selected.size < items.length ? `&ids=${[...selected].join(",")}` : "";
  const copyText = () =>
    run("copy", async () => {
      const res = await fetch(`/api/inventions/export?fmt=text${idsParam}`);
      if (!res.ok) throw new Error("Export failed");
      await navigator.clipboard.writeText(await res.text());
    }, "Copied to clipboard.");

  const toggleSet = (set: Set<number>, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Exhibit A — prior inventions</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            The prior inventions and original works of authorship you list in an employer&apos;s invention-assignment
            agreement. Private by default; opt individual entries into resume generation.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ id: null, draft: { ...BLANK } })}>Add entry</button>
      </div>
      {(err || msg) && <p className="text-sm" style={{ color: err ? "var(--danger)" : "var(--success)" }}>{err || msg}</p>}

      {editing && (
        <section className="card p-4" style={{ borderColor: "var(--accent)" }}>
          <h2 className="font-semibold mb-2">{editing.id == null ? "New entry — review before saving" : "Edit entry"}</h2>
          {editing.draft.ownershipCaution && (
            <p className="text-sm mb-2 rounded-md p-2" style={{ background: "#fef3c7", color: "#92400e" }}>
              ⚠ {editing.draft.ownershipCaution} — check whether this belongs to that employer before listing it.
            </p>
          )}
          <EntryForm value={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} />
          <div className="flex gap-2 mt-3">
            <button className="btn btn-primary" disabled={busy === "save" || !editing.draft.title.trim()} onClick={saveEditing}>
              {busy === "save" ? "Saving…" : "Save entry"}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </section>
      )}

      <section className="card p-4">
        <h2 className="font-semibold mb-2">Add with AI</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {TABS.map(([k, label]) => (
            <button key={k} className={`btn ${tab === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        {tab === "describe" && (
          <div>
            <textarea className="textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Describe the project or invention in your own words: what it is, when you made it, and anything that identifies it." />
            <button className="btn btn-primary mt-2" disabled={busy !== "" || !text.trim()} onClick={() => draftFrom({ text })}>
              {busy === "draft" ? "Drafting…" : "Draft entry"}
            </button>
          </div>
        )}

        {tab === "repo" && (
          <div>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/you/project" />
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Public GitHub repos only. For private repos or other hosts, paste the README under &ldquo;Describe it&rdquo;.
            </p>
            <button className="btn btn-primary mt-2" disabled={busy !== "" || !url.trim()} onClick={() => draftFrom({ url })}>
              {busy === "draft" ? "Reading repo…" : "Draft from repo"}
            </button>
          </div>
        )}

        {tab === "suggest" && (
          <div>
            <p className="text-sm mb-2" style={{ color: "var(--muted)" }}>
              Searches your career profile, career files, jobs and work journal for prior work you haven&apos;t listed.
              Items that may have been made for an employer are flagged — the AI never decides ownership.
            </p>
            <button className="btn btn-primary" disabled={busy !== ""} onClick={suggest}>
              {busy === "suggest" ? "Searching…" : "Suggest entries"}
            </button>
            {suggestions && (
              <div className="flex flex-col gap-2 mt-3">
                {suggestions.length === 0 && <p className="text-sm">No new suggestions.</p>}
                {suggestions.map((s, i) => (
                  <div key={i} className="rounded-md border p-2 text-sm flex items-start justify-between gap-2" style={{ borderColor: "var(--border)" }}>
                    <div>
                      <span className="font-semibold">{s.title}</span>
                      {s.inventionDate && <span style={{ color: "var(--muted)" }}> · {s.inventionDate}</span>}
                      {s.source && <span className="block" style={{ color: "var(--muted)" }}>From: {s.source}</span>}
                      {s.ownershipCaution && <span className="block" style={{ color: "#92400e" }}>⚠ {s.ownershipCaution}</span>}
                    </div>
                    <button className="btn btn-ghost" onClick={() => {
                      setEditing({ id: null, draft: s });
                      setSuggestions(suggestions.filter((_, j) => j !== i));
                    }}>Review &amp; add</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "import" && (
          <div>
            <input type="file" accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.md" className="text-sm mb-2"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {!file && (
              <textarea className="textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)}
                placeholder="…or paste the text of your existing Exhibit A" />
            )}
            <button className="btn btn-primary mt-2" disabled={busy !== "" || (!file && !text.trim())} onClick={importParse}>
              {busy === "import" ? "Reading…" : "Find entries"}
            </button>
            {imported && (
              <div className="mt-3">
                {imported.length === 0 && <p className="text-sm">No entries found.</p>}
                <div className="flex flex-col gap-2">
                  {imported.map((d, i) => (
                    <label key={i} className="flex items-start gap-2 rounded-md border p-2 text-sm" style={{ borderColor: "var(--border)" }}>
                      <input type="checkbox" className="mt-1" checked={picked.has(i)} onChange={() => setPicked(toggleSet(picked, i))} />
                      <span>
                        <span className="font-semibold">{d.title}</span>
                        {d.inventionDate && <span style={{ color: "var(--muted)" }}> · {d.inventionDate}</span>}
                        {d.duplicate && <span className="badge ml-2" style={{ background: "var(--surface-2)" }}>already listed</span>}
                        {d.description && <span className="block" style={{ color: "var(--muted)" }}>{d.description}</span>}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button className="btn btn-primary" disabled={busy !== "" || picked.size === 0} onClick={importSave}>
                    {busy === "importSave" ? "Saving…" : `Add ${picked.size}`}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setImported(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-semibold">Entries {items && `(${selected.size} of ${items.length} selected for export)`}</h2>
          <div className="flex flex-wrap gap-2">
            <a className={`btn btn-ghost ${selected.size ? "" : "pointer-events-none opacity-50"}`} href={`/api/inventions/export?fmt=docx${idsParam}`}>Download DOCX</a>
            <a className={`btn btn-ghost ${selected.size ? "" : "pointer-events-none opacity-50"}`} href={`/api/inventions/export?fmt=pdf${idsParam}`}>Download PDF</a>
            <button className="btn btn-ghost" disabled={busy !== "" || selected.size === 0} onClick={copyText}>
              {busy === "copy" ? "Copying…" : "Copy as text"}
            </button>
          </div>
        </div>
        {items === null ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No entries yet. Import your existing Exhibit A, or add one with AI above.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((inv) => (
              <div key={inv.id} className="rounded-md border p-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={selected.has(inv.id)} onChange={() => setSelected(toggleSet(selected, inv.id))} />
                    <span>
                      <span className="font-semibold">{inv.title}</span>
                      {inv.inventionDate && <span style={{ color: "var(--muted)" }}> · {inv.inventionDate}</span>}
                      <span className="badge ml-2" style={{ background: "var(--surface-2)" }}>{INVENTION_KIND_LABELS[inv.kind] ?? inv.kind}</span>
                      {inv.includeInResume && <span className="badge ml-2" style={{ background: "#d1fae5", color: "#065f46" }}>in resumes</span>}
                    </span>
                  </label>
                  <div className="flex items-center gap-3 text-xs">
                    <button className="hover:underline" style={{ color: "var(--accent)" }} disabled={busy !== ""} onClick={() => toggleResume(inv)}>
                      {inv.includeInResume ? "Exclude from resumes" : "Include in resumes"}
                    </button>
                    <button className="hover:underline" style={{ color: "var(--accent)" }} onClick={() => setEditing({ id: inv.id, draft: { ...inv } })}>edit</button>
                    <button className="hover:underline" style={{ color: "var(--danger)" }} onClick={() => del(inv)}>delete</button>
                  </div>
                </div>
                {inv.identifier && <p className="text-sm mt-1 break-all" style={{ color: "var(--muted)" }}>{inv.identifier}</p>}
                {inv.description && <p className="text-sm mt-1 whitespace-pre-wrap">{inv.description}</p>}
                {inv.technologies.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {inv.technologies.map((t) => (
                      <span key={t} className="badge" style={{ background: "var(--surface-2)", textTransform: "none" }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
