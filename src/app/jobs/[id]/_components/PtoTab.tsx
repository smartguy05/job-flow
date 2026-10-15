"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/ui";
import { PTO_KINDS, type PtoBalance } from "@/lib/pto";
import { PTO_KIND_LABELS } from "@/lib/job-labels";
import { SmallButton, Status, muted, rowBorder, useActions, useList } from "./shared";

type Entry = { id: number; startDate: string; endDate: string; days: number; kind: string; note: string | null };

const EMPTY = { startDate: "", endDate: "", days: "", kind: "vacation", note: "" };
type PtoForm = typeof EMPTY;

const toForm = (e: Entry): PtoForm => ({ startDate: e.startDate, endDate: e.endDate, days: String(e.days), kind: e.kind, note: e.note ?? "" });
// Blank days = let the server count the weekdays in the range.
const toBody = (f: PtoForm) => ({ ...f, days: f.days.trim() === "" ? undefined : f.days });

function PtoFields({ value, onChange }: { value: PtoForm; onChange: (v: PtoForm) => void }) {
  const set = (k: keyof PtoForm) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      <label className="text-xs" style={muted}>From
        <input type="date" className="input" value={value.startDate} onChange={set("startDate")} />
      </label>
      <label className="text-xs" style={muted}>To (blank = same day)
        <input type="date" className="input" value={value.endDate} onChange={set("endDate")} />
      </label>
      <label className="text-xs" style={muted}>Days (blank = weekdays)
        <input className="input" inputMode="decimal" value={value.days} onChange={set("days")} />
      </label>
      <label className="text-xs" style={muted}>Kind
        <select className="select" value={value.kind} onChange={set("kind")}>
          {PTO_KINDS.map((k) => <option key={k} value={k}>{PTO_KIND_LABELS[k]}</option>)}
        </select>
      </label>
      <input className="input sm:col-span-4" placeholder="Note (private)" value={value.note} onChange={set("note")} />
    </div>
  );
}

export function PtoTab({ id, reload }: { id: string; reload: () => Promise<unknown> }) {
  const base = `/api/jobs/${id}`;
  const [entries, refreshEntries] = useList<Entry>(`${base}/pto`);
  const [year, setYear] = useState(new Date().getFullYear());
  const [balance, setBalance] = useState<PtoBalance | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [edit, setEdit] = useState<{ id: number; form: PtoForm } | null>(null);
  const loadBalance = useCallback(() => api<PtoBalance>(`${base}/pto/summary?year=${year}`).then(setBalance), [base, year]);
  useEffect(() => {
    api<PtoBalance>(`${base}/pto/summary?year=${year}`).then(setBalance).catch(() => setBalance(null));
  }, [base, year]);
  const { busy, err, msg, run } = useActions(async () => {
    await Promise.all([refreshEntries(), loadBalance(), reload()]);
  });

  const add = () =>
    run("add", async () => {
      await api(`${base}/pto`, { method: "POST", body: JSON.stringify(toBody(form)) });
      setForm(EMPTY);
    });
  const save = () =>
    edit &&
    run("edit", async () => {
      await api(`${base}/pto/${edit.id}`, { method: "PATCH", body: JSON.stringify(toBody(edit.form)) });
      setEdit(null);
    }, "Entry saved.");
  const del = (eid: number) => run(`del-${eid}`, () => api(`${base}/pto/${eid}`, { method: "DELETE" }));
  const years = [...new Set([new Date().getFullYear(), ...entries.map((e) => Number(e.startDate.slice(0, 4)))])].sort((a, b) => b - a);

  return (
    <div className="flex flex-col gap-6">
      <Status err={err} msg={msg} />
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="font-semibold">Balance</h2>
          <select className="select text-sm" style={{ width: "auto" }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {balance && (
          <>
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <div><div style={muted}>Allowance</div><div className="text-lg font-semibold">{balance.allowance ?? "—"}</div></div>
              <div><div style={muted}>Used (vacation + other)</div><div className="text-lg font-semibold">{balance.used}</div></div>
              <div>
                <div style={muted}>Remaining</div>
                <div className="text-lg font-semibold" style={balance.remaining != null && balance.remaining < 0 ? { color: "var(--danger)" } : undefined}>
                  {balance.remaining ?? "—"}
                </div>
              </div>
            </div>
            <p className="text-xs mt-2" style={muted}>
              {PTO_KINDS.map((k) => `${PTO_KIND_LABELS[k]} ${balance.byKind[k]}`).join(" · ")}
              {balance.allowance == null && " · Set PTO days on the Pay tab's benefits to track a balance."}
            </p>
          </>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-1">Time off</h2>
        <p className="text-sm mb-3" style={muted}>Vacation and other days count against the allowance; sick days and holidays are tracked separately. Private.</p>
        <div className="rounded-md border p-3 mb-4" style={{ borderColor: "var(--accent)" }}>
          <PtoFields value={form} onChange={setForm} />
          <button className="btn btn-primary mt-2" disabled={busy === "add" || !form.startDate} onClick={add}>
            {busy === "add" ? "Logging…" : "Log time off"}
          </button>
        </div>
        {entries.length === 0 && <p className="text-sm" style={muted}>No time off logged yet.</p>}
        <div className="flex flex-col gap-2">
          {entries.map((e) =>
            edit?.id === e.id ? (
              <div key={e.id} className="rounded-md border p-3" style={{ borderColor: "var(--accent)" }}>
                <PtoFields value={edit.form} onChange={(f) => setEdit({ ...edit, form: f })} />
                <div className="flex gap-2 mt-2">
                  <button className="btn btn-primary" disabled={busy === "edit"} onClick={save}>Save</button>
                  <button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div key={e.id} className="rounded-md border p-3 text-sm flex flex-wrap items-center justify-between gap-2" style={rowBorder}>
                <div>
                  <span className="badge mr-2" style={{ background: "var(--surface-2)" }}>{PTO_KIND_LABELS[e.kind] ?? e.kind}</span>
                  <span className="font-semibold">{e.startDate === e.endDate ? e.startDate : `${e.startDate} – ${e.endDate}`}</span>
                  <span style={muted}> · {e.days} day{e.days === 1 ? "" : "s"}</span>
                  {e.note && <span style={muted}> · {e.note}</span>}
                </div>
                <div className="flex gap-3">
                  <SmallButton onClick={() => setEdit({ id: e.id, form: toForm(e) })}>edit</SmallButton>
                  <SmallButton danger onClick={() => del(e.id)}>delete</SmallButton>
                </div>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
