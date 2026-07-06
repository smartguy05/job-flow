"use client";

import { useEffect, useState } from "react";
import { api, fmtDate } from "@/lib/ui";

type Contact = {
  id: number; name: string; agency: string | null; email: string | null;
  linkedin: string | null; notes: string | null; createdAt: string;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState({ name: "", agency: "", email: "", linkedin: "", notes: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    api<Contact[]>("/api/contacts").then(setContacts);
  }
  useEffect(load, []);

  async function add() {
    if (!form.name.trim()) return;
    setBusy(true);
    await api("/api/contacts", { method: "POST", body: JSON.stringify(form) });
    setForm({ name: "", agency: "", email: "", linkedin: "", notes: "" });
    setBusy(false);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Contacts</h1>

      <section className="card p-4">
        <h2 className="font-semibold mb-3">Add contact</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Agency / company" value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} />
          <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="LinkedIn" value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} />
          <input className="input md:col-span-2" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <button className="btn btn-primary mt-3" disabled={busy || !form.name.trim()} onClick={add}>Add</button>
      </section>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Agency</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3 font-semibold">{c.name}</td>
                <td className="p-3" style={{ color: "var(--muted)" }}>{c.agency ?? "—"}</td>
                <td className="p-3" style={{ color: "var(--muted)" }}>{c.email ?? "—"}</td>
                <td className="p-3" style={{ color: "var(--muted)" }}>{c.notes ?? "—"}</td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr><td className="p-4" style={{ color: "var(--muted)" }} colSpan={4}>No contacts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
