"use client";

import { useState } from "react";
import { api } from "@/lib/ui";
import { COMP_KIND_LABELS, formatAmount } from "@/lib/job-labels";
import { SmallButton, Status, muted, rowBorder, useActions, type Benefits, type CompStep, type TabProps } from "./shared";

const BENEFIT_FIELDS: [keyof Benefits, string][] = [
  ["health", "Health insurance"],
  ["retirement", "Retirement (e.g. 401k match)"],
  ["ptoDays", "PTO days / year"],
  ["parentalLeave", "Parental leave"],
  ["remotePolicy", "Remote policy"],
];

const benefitsForm = (b: Benefits | null): Record<string, string> =>
  Object.fromEntries([...BENEFIT_FIELDS.map(([k]) => k), "other"].map((k) => [k, b?.[k as keyof Benefits]?.toString() ?? ""]));

const EMPTY_COMP = { kind: "raise", effectiveDate: "", baseAmount: "", title: "", bonus: "", equity: "", notes: "" };
type CompForm = typeof EMPTY_COMP;

const toForm = (c: CompStep): CompForm => ({
  kind: c.kind,
  effectiveDate: c.effectiveDate ?? "",
  baseAmount: c.baseAmount?.toString() ?? "",
  title: c.title ?? "",
  bonus: c.bonus ?? "",
  equity: c.equity ?? "",
  notes: c.notes ?? "",
});

function CompFields({ value, onChange }: { value: CompForm; onChange: (v: CompForm) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      <select className="select" value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value })}>
        {Object.entries(COMP_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <input type="date" className="input" value={value.effectiveDate} onChange={(e) => onChange({ ...value, effectiveDate: e.target.value })} />
      <input className="input" inputMode="numeric" placeholder="New base (e.g. 150000)" value={value.baseAmount}
        onChange={(e) => onChange({ ...value, baseAmount: e.target.value })} />
      <input className="input" placeholder="New title (promotions)" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
      <input className="input" placeholder="Bonus" value={value.bonus} onChange={(e) => onChange({ ...value, bonus: e.target.value })} />
      <input className="input" placeholder="Equity" value={value.equity} onChange={(e) => onChange({ ...value, equity: e.target.value })} />
      <input className="input sm:col-span-2" placeholder="Notes" value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
    </div>
  );
}

export function PayTab({ id, d, reload }: TabProps) {
  const [comp, setComp] = useState(EMPTY_COMP);
  const [editing, setEditing] = useState<{ id: number; form: CompForm } | null>(null);
  const [benefits, setBenefits] = useState<Record<string, string>>(() => benefitsForm(d.benefits));
  const { busy, err, msg, run } = useActions(reload);
  const [loaded, setLoaded] = useState(d.benefits);
  if (loaded !== d.benefits) {
    setLoaded(d.benefits);
    setBenefits(benefitsForm(d.benefits));
  }

  const s = d.compSummary;
  const addComp = () =>
    run("comp", async () => {
      await api(`/api/jobs/${id}/compensation`, { method: "POST", body: JSON.stringify(comp) });
      setComp(EMPTY_COMP);
    });
  const saveComp = () =>
    editing &&
    run("comp-edit", async () => {
      await api(`/api/jobs/${id}/compensation/${editing.id}`, { method: "PATCH", body: JSON.stringify(editing.form) });
      setEditing(null);
    }, "Pay change saved.");
  const delComp = (compId: number) => run(`comp-${compId}`, () => api(`/api/jobs/${id}/compensation/${compId}`, { method: "DELETE" }));
  const saveBenefits = () =>
    run("benefits", () => api(`/api/jobs/${id}/benefits`, { method: "PUT", body: JSON.stringify(benefits) }), "Benefits saved.");

  return (
    <div className="flex flex-col gap-6">
      <section className="card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="font-semibold">Compensation</h2>
          <span className="text-sm" style={muted}>
            {s.current ? `Current base ${formatAmount(s.current.baseAmount, s.current.period, s.current.currency)}` : "No pay recorded"}
            {s.totalGrowthPct != null && ` · ${s.totalGrowthPct >= 0 ? "+" : ""}${s.totalGrowthPct}% since start`}
          </span>
        </div>
        <Status err={err} msg={msg} />
        {s.steps.length > 0 && (
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={muted}>
                  <th className="py-1 pr-3">Date</th><th className="pr-3">Change</th><th className="pr-3">Base</th>
                  <th className="pr-3">Δ</th><th className="pr-3">Bonus / equity</th><th />
                </tr>
              </thead>
              <tbody>
                {s.steps.map((c) => (
                  <tr key={c.id} className="border-t" style={rowBorder}>
                    <td className="py-1 pr-3 whitespace-nowrap">{c.effectiveDate ?? "—"}</td>
                    <td className="pr-3">{COMP_KIND_LABELS[c.kind] ?? c.kind}{c.title ? ` — ${c.title}` : ""}</td>
                    <td className="pr-3 whitespace-nowrap">{formatAmount(c.baseAmount, c.period, c.currency)}</td>
                    <td className="pr-3" style={{ color: c.changePct != null && c.changePct > 0 ? "var(--success)" : undefined }}>
                      {c.changePct != null ? `${c.changePct > 0 ? "+" : ""}${c.changePct}%` : ""}
                    </td>
                    <td className="pr-3">{[c.bonus, c.equity, c.notes].filter(Boolean).join(" · ")}</td>
                    <td className="text-right whitespace-nowrap">
                      <SmallButton onClick={() => setEditing({ id: c.id, form: toForm(c) })}>edit</SmallButton>{" "}
                      <SmallButton danger onClick={() => delComp(c.id)}>remove</SmallButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {editing ? (
          <div className="rounded-md border p-3" style={{ borderColor: "var(--accent)" }}>
            <p className="text-sm font-semibold mb-2">Edit pay change</p>
            <CompFields value={editing.form} onChange={(form) => setEditing({ ...editing, form })} />
            <div className="flex gap-2 mt-2">
              <button className="btn btn-primary" disabled={busy === "comp-edit"} onClick={saveComp}>
                {busy === "comp-edit" ? "Saving…" : "Save"}
              </button>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <CompFields value={comp} onChange={setComp} />
            <button className="btn btn-primary mt-2" disabled={busy === "comp"} onClick={addComp}>
              {busy === "comp" ? "Adding…" : "Add pay change"}
            </button>
          </>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-3">Benefits</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {BENEFIT_FIELDS.map(([k, label]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <input className="input" inputMode={k === "ptoDays" ? "numeric" : undefined} value={benefits[k] ?? ""}
                onChange={(e) => setBenefits({ ...benefits, [k]: e.target.value })} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="label">Other (perks, stipends, insurance details…)</label>
            <textarea className="textarea" rows={3} value={benefits.other ?? ""} onChange={(e) => setBenefits({ ...benefits, other: e.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary mt-3" disabled={busy === "benefits"} onClick={saveBenefits}>
          {busy === "benefits" ? "Saving…" : "Save benefits"}
        </button>
      </section>
    </div>
  );
}
