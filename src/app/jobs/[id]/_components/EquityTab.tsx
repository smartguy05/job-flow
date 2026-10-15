"use client";

import { useEffect, useState } from "react";
import { api, fmtDate } from "@/lib/ui";
import { EQUITY_TYPES, VEST_FREQUENCIES } from "@/lib/vesting";
import { VEST_FREQUENCY_LABELS, formatShares } from "@/lib/job-labels";
import { SmallButton, Status, muted, rowBorder, useActions, useList } from "./shared";

type VestEvent = { date: string; shares: number; cumulative: number };
type Grant = {
  id: number;
  type: string;
  grantDate: string | null;
  shares: number;
  strikePrice: number | null;
  vestStart: string | null;
  cliffMonths: number;
  vestMonths: number;
  frequency: string;
  notes: string | null;
  vesting: { vested: number; unvested: number; nextVest: { date: string; shares: number } | null; fullyVestedOn: string | null };
  schedule: VestEvent[];
};
type Totals = { shares: number; vested: number; unvested: number; nextVest: { date: string; shares: number; grantId: number } | null };

const EMPTY = { type: "RSU", grantDate: "", shares: "", strikePrice: "", vestStart: "", cliffMonths: "12", vestMonths: "48", frequency: "monthly", notes: "" };
type GrantForm = typeof EMPTY;

const toForm = (g: Grant): GrantForm => ({
  type: g.type,
  grantDate: g.grantDate ?? "",
  shares: String(g.shares),
  strikePrice: g.strikePrice?.toString() ?? "",
  vestStart: g.vestStart ?? "",
  cliffMonths: String(g.cliffMonths),
  vestMonths: String(g.vestMonths),
  frequency: g.frequency,
  notes: g.notes ?? "",
});

function GrantFields({ value, onChange }: { value: GrantForm; onChange: (v: GrantForm) => void }) {
  const set = (k: keyof GrantForm) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      <label className="text-xs" style={muted}>Type
        <select className="select" value={value.type} onChange={set("type")}>
          {EQUITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className="text-xs" style={muted}>Shares
        <input className="input" inputMode="numeric" value={value.shares} onChange={set("shares")} />
      </label>
      <label className="text-xs" style={muted}>Grant date
        <input type="date" className="input" value={value.grantDate} onChange={set("grantDate")} />
      </label>
      <label className="text-xs" style={muted}>Strike price (options)
        <input className="input" inputMode="decimal" value={value.strikePrice} onChange={set("strikePrice")} />
      </label>
      <label className="text-xs" style={muted}>Vest start (blank = grant date)
        <input type="date" className="input" value={value.vestStart} onChange={set("vestStart")} />
      </label>
      <label className="text-xs" style={muted}>Cliff (months)
        <input className="input" inputMode="numeric" value={value.cliffMonths} onChange={set("cliffMonths")} />
      </label>
      <label className="text-xs" style={muted}>Vesting period (months)
        <input className="input" inputMode="numeric" value={value.vestMonths} onChange={set("vestMonths")} />
      </label>
      <label className="text-xs" style={muted}>Frequency
        <select className="select" value={value.frequency} onChange={set("frequency")}>
          {VEST_FREQUENCIES.map((f) => <option key={f} value={f}>{VEST_FREQUENCY_LABELS[f]}</option>)}
        </select>
      </label>
      <textarea className="textarea sm:col-span-4" rows={2} placeholder="Notes (private)" value={value.notes} onChange={set("notes")} />
    </div>
  );
}

function VestBar({ vested, total }: { vested: number; total: number }) {
  const pct = total ? Math.round((vested / total) * 100) : 0;
  return (
    <div className="h-2 rounded-full overflow-hidden mt-2" style={{ background: "var(--surface-2)" }} title={`${pct}% vested`}>
      <div className="h-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
    </div>
  );
}

export function EquityTab({ id, reload }: { id: string; reload: () => Promise<unknown> }) {
  const base = `/api/jobs/${id}`;
  const [grants, refreshGrants] = useList<Grant>(`${base}/equity`);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [edit, setEdit] = useState<{ id: number; form: GrantForm } | null>(null);
  const loadTotals = () => api<{ totals: Totals }>(`${base}/equity/summary`).then((s) => setTotals(s.totals));
  useEffect(() => {
    api<{ totals: Totals }>(`${base}/equity/summary`).then((s) => setTotals(s.totals)).catch(() => setTotals(null));
  }, [base]);
  const { busy, err, msg, run } = useActions(async () => {
    await Promise.all([refreshGrants(), loadTotals(), reload()]);
  });

  const add = () =>
    run("add", async () => {
      await api(`${base}/equity`, { method: "POST", body: JSON.stringify(form) });
      setForm(EMPTY);
    });
  const save = () =>
    edit &&
    run("edit", async () => {
      await api(`${base}/equity/${edit.id}`, { method: "PATCH", body: JSON.stringify(edit.form) });
      setEdit(null);
    }, "Grant saved.");
  const del = (gid: number) => {
    if (!confirm("Delete this grant?")) return;
    run(`del-${gid}`, () => api(`${base}/equity/${gid}`, { method: "DELETE" }));
  };

  return (
    <div className="flex flex-col gap-6">
      <Status err={err} msg={msg} />
      {totals && totals.shares > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold mb-2">Summary</h2>
          <div className="grid gap-3 sm:grid-cols-4 text-sm">
            <div><div style={muted}>Granted</div><div className="text-lg font-semibold">{formatShares(totals.shares)}</div></div>
            <div><div style={muted}>Vested</div><div className="text-lg font-semibold">{formatShares(totals.vested)}</div></div>
            <div><div style={muted}>Unvested</div><div className="text-lg font-semibold">{formatShares(totals.unvested)}</div></div>
            <div>
              <div style={muted}>Next vest</div>
              <div className="text-lg font-semibold">
                {totals.nextVest ? `${formatShares(totals.nextVest.shares)} on ${fmtDate(`${totals.nextVest.date}T12:00:00Z`)}` : "Fully vested"}
              </div>
            </div>
          </div>
          <VestBar vested={totals.vested} total={totals.shares} />
        </section>
      )}

      <section className="card p-4">
        <h2 className="font-semibold mb-1">Equity grants</h2>
        <p className="text-sm mb-3" style={muted}>
          RSUs, options and ESPP. The schedule is computed from the cliff, period and frequency; the next vest shows on the calendar.
          Private — never sent to the AI or your career profile.
        </p>
        <div className="flex flex-col gap-2 mb-4">
          {grants.length === 0 && <p className="text-sm" style={muted}>No grants yet.</p>}
          {grants.map((g) =>
            edit?.id === g.id ? (
              <div key={g.id} className="rounded-md border p-3" style={{ borderColor: "var(--accent)" }}>
                <GrantFields value={edit.form} onChange={(f) => setEdit({ ...edit, form: f })} />
                <div className="flex gap-2 mt-2">
                  <button className="btn btn-primary" disabled={busy === "edit"} onClick={save}>Save</button>
                  <button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div key={g.id} className="rounded-md border p-3 text-sm" style={rowBorder}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="badge mr-2" style={{ background: "var(--surface-2)" }}>{g.type}</span>
                    <span className="font-semibold">{formatShares(g.shares)} shares</span>
                    {g.grantDate && <span style={muted}> · granted {g.grantDate}</span>}
                    {g.strikePrice != null && <span style={muted}> · strike ${g.strikePrice}</span>}
                    <span style={muted}>
                      {" "}· {g.cliffMonths}-mo cliff, {g.vestMonths} mo {VEST_FREQUENCY_LABELS[g.frequency]?.toLowerCase() ?? g.frequency}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <SmallButton onClick={() => setEdit({ id: g.id, form: toForm(g) })}>edit</SmallButton>
                    <SmallButton danger onClick={() => del(g.id)}>delete</SmallButton>
                  </div>
                </div>
                <div className="mt-1" style={muted}>
                  {formatShares(g.vesting.vested)} vested · {formatShares(g.vesting.unvested)} unvested
                  {g.vesting.nextVest ? ` · next ${formatShares(g.vesting.nextVest.shares)} on ${g.vesting.nextVest.date}` : ""}
                  {g.vesting.fullyVestedOn ? ` · fully vested ${g.vesting.fullyVestedOn}` : ""}
                </div>
                <VestBar vested={g.vesting.vested} total={g.vesting.vested + g.vesting.unvested} />
                {g.notes && <p className="mt-2 whitespace-pre-wrap" style={muted}>{g.notes}</p>}
                {g.schedule.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs" style={{ color: "var(--accent)" }}>Vesting schedule ({g.schedule.length} vests)</summary>
                    <table className="mt-2 text-xs w-full max-w-md">
                      <thead><tr style={muted}><th className="text-left">Date</th><th className="text-right">Shares</th><th className="text-right">Cumulative</th></tr></thead>
                      <tbody>
                        {g.schedule.map((e) => (
                          <tr key={e.date}>
                            <td>{e.date}</td>
                            <td className="text-right">{formatShares(e.shares)}</td>
                            <td className="text-right">{formatShares(e.cumulative)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </div>
            ),
          )}
        </div>
        <div className="rounded-md border p-3" style={rowBorder}>
          <GrantFields value={form} onChange={setForm} />
          <button className="btn btn-primary mt-2" disabled={busy === "add" || !form.shares.trim()} onClick={add}>
            {busy === "add" ? "Adding…" : "Add grant"}
          </button>
        </div>
      </section>
    </div>
  );
}
