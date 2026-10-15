"use client";

import { useState } from "react";
import { api } from "@/lib/ui";
import { PERSON_RELATIONSHIP_LABELS, checklistToText, textToChecklist } from "@/lib/job-labels";
import { SmallButton, Status, muted, rowBorder, useActions, useList, type ChecklistItem } from "./shared";

type Person = {
  id: number;
  name: string;
  relationship: string;
  title: string | null;
  email: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
};
type OneOnOne = { id: number; personId: number | null; date: string | null; notes: string; actionItems: ChecklistItem[] };

const EMPTY_PERSON = { name: "", relationship: "manager", title: "", email: "", startDate: "", endDate: "", notes: "" };
type PersonForm = typeof EMPTY_PERSON;
const EMPTY_11 = { personId: "", date: "", notes: "", actionItems: "" };
type OneOnOneForm = typeof EMPTY_11;

const personForm = (p: Person): PersonForm => ({
  name: p.name,
  relationship: p.relationship,
  title: p.title ?? "",
  email: p.email ?? "",
  startDate: p.startDate ?? "",
  endDate: p.endDate ?? "",
  notes: p.notes ?? "",
});
const oneOnOneBody = (f: OneOnOneForm) => ({
  personId: f.personId ? Number(f.personId) : null,
  date: f.date,
  notes: f.notes,
  actionItems: textToChecklist(f.actionItems),
});

function PersonFields({ value, onChange }: { value: PersonForm; onChange: (v: PersonForm) => void }) {
  const set = (k: keyof PersonForm) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <input className="input" placeholder="Name" value={value.name} onChange={set("name")} />
      <select className="select" value={value.relationship} onChange={set("relationship")}>
        {Object.entries(PERSON_RELATIONSHIP_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <input className="input" placeholder="Title" value={value.title} onChange={set("title")} />
      <input className="input" placeholder="Email" value={value.email} onChange={set("email")} />
      <input type="date" className="input" title="From" value={value.startDate} onChange={set("startDate")} />
      <input type="date" className="input" title="Until (blank = current)" value={value.endDate} onChange={set("endDate")} />
      <textarea className="textarea sm:col-span-3" rows={2} placeholder="Notes (private)" value={value.notes} onChange={set("notes")} />
    </div>
  );
}

function OneOnOneFields({ value, onChange, people }: { value: OneOnOneForm; onChange: (v: OneOnOneForm) => void; people: Person[] }) {
  const set = (k: keyof OneOnOneForm) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <select className="select" value={value.personId} onChange={set("personId")}>
        <option value="">With… (optional)</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input type="date" className="input" value={value.date} onChange={set("date")} />
      <textarea className="textarea sm:col-span-2" rows={3} placeholder="Notes (private — never sent to the AI)" value={value.notes} onChange={set("notes")} />
      <textarea className="textarea sm:col-span-2" rows={2} placeholder={"Action items, one per line ([x] = done)"} value={value.actionItems}
        onChange={set("actionItems")} />
    </div>
  );
}

export function PeopleTab({ id, reload }: { id: string; reload: () => Promise<unknown> }) {
  const [people, refreshPeople] = useList<Person>(`/api/jobs/${id}/people`);
  const [meetings, refreshMeetings] = useList<OneOnOne>(`/api/jobs/${id}/one-on-ones`);
  const [person, setPerson] = useState(EMPTY_PERSON);
  const [editPerson, setEditPerson] = useState<{ id: number; form: PersonForm } | null>(null);
  const [meeting, setMeeting] = useState(EMPTY_11);
  const [editMeeting, setEditMeeting] = useState<{ id: number; form: OneOnOneForm } | null>(null);
  const { busy, err, msg, run } = useActions(async () => {
    await Promise.all([refreshPeople(), refreshMeetings(), reload()]);
  });
  const nameOf = (pid: number | null) => people.find((p) => p.id === pid)?.name;
  const base = `/api/jobs/${id}`;

  const addPerson = () =>
    run("person", async () => {
      await api(`${base}/people`, { method: "POST", body: JSON.stringify(person) });
      setPerson(EMPTY_PERSON);
    });
  const savePerson = () =>
    editPerson &&
    run("person-edit", async () => {
      await api(`${base}/people/${editPerson.id}`, { method: "PATCH", body: JSON.stringify(editPerson.form) });
      setEditPerson(null);
    }, "Person saved.");
  const addMeeting = () =>
    run("meeting", async () => {
      await api(`${base}/one-on-ones`, { method: "POST", body: JSON.stringify(oneOnOneBody(meeting)) });
      setMeeting({ ...EMPTY_11, personId: meeting.personId });
    });
  const saveMeeting = () =>
    editMeeting &&
    run("meeting-edit", async () => {
      await api(`${base}/one-on-ones/${editMeeting.id}`, { method: "PATCH", body: JSON.stringify(oneOnOneBody(editMeeting.form)) });
      setEditMeeting(null);
    }, "1:1 saved.");
  const toggleItem = (m: OneOnOne, i: number) =>
    run(`toggle-${m.id}`, () =>
      api(`${base}/one-on-ones/${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({ actionItems: m.actionItems.map((a, j) => (j === i ? { ...a, done: !a.done } : a)) }),
      }),
    );
  const del = (kind: string, rowId: number) => run(`${kind}-${rowId}`, () => api(`${base}/${kind}/${rowId}`, { method: "DELETE" }));

  return (
    <div className="flex flex-col gap-6">
      <Status err={err} msg={msg} />
      <section className="card p-4">
        <h2 className="font-semibold mb-1">People</h2>
        <p className="text-sm mb-3" style={muted}>
          Managers, skip-levels, peers, reports, mentors and stakeholders. Manager rows with dates form your manager history.
        </p>
        <div className="flex flex-col gap-2 mb-4">
          {people.length === 0 && <p className="text-sm" style={muted}>No people yet.</p>}
          {people.map((p) =>
            editPerson?.id === p.id ? (
              <div key={p.id} className="rounded-md border p-3" style={{ borderColor: "var(--accent)" }}>
                <PersonFields value={editPerson.form} onChange={(form) => setEditPerson({ ...editPerson, form })} />
                <div className="flex gap-2 mt-2">
                  <button className="btn btn-primary" disabled={busy === "person-edit"} onClick={savePerson}>Save</button>
                  <button className="btn btn-ghost" onClick={() => setEditPerson(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div key={p.id} className="rounded-md border p-3 text-sm" style={rowBorder}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="badge mr-2" style={{ background: "var(--surface-2)" }}>
                      {PERSON_RELATIONSHIP_LABELS[p.relationship] ?? p.relationship}
                    </span>
                    <span className="font-semibold">{p.name}</span>
                    {p.title && <span style={muted}> · {p.title}</span>}
                    {(p.startDate || p.endDate) && <span style={muted}> · {p.startDate ?? "?"} – {p.endDate ?? "present"}</span>}
                    {p.email && <span style={muted}> · {p.email}</span>}
                  </div>
                  <div className="flex gap-3">
                    <SmallButton onClick={() => setEditPerson({ id: p.id, form: personForm(p) })}>edit</SmallButton>
                    <SmallButton danger onClick={() => del("people", p.id)}>delete</SmallButton>
                  </div>
                </div>
                {p.notes && <p className="mt-1 whitespace-pre-wrap" style={muted}>{p.notes}</p>}
              </div>
            ),
          )}
        </div>
        <div className="rounded-md border p-3" style={rowBorder}>
          <PersonFields value={person} onChange={setPerson} />
          <button className="btn btn-primary mt-2" disabled={busy === "person" || !person.name.trim()} onClick={addPerson}>
            {busy === "person" ? "Adding…" : "Add person"}
          </button>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-1">1:1s</h2>
        <p className="text-sm mb-3" style={muted}>Private meeting notes and action items. Never sent to the AI or your career profile.</p>
        <div className="rounded-md border p-3 mb-4" style={{ borderColor: "var(--accent)" }}>
          <OneOnOneFields value={meeting} onChange={setMeeting} people={people} />
          <button className="btn btn-primary mt-2" disabled={busy === "meeting"} onClick={addMeeting}>
            {busy === "meeting" ? "Logging…" : "Log 1:1"}
          </button>
        </div>
        {meetings.length === 0 && <p className="text-sm" style={muted}>No 1:1s logged yet.</p>}
        <div className="flex flex-col gap-2">
          {meetings.map((m) =>
            editMeeting?.id === m.id ? (
              <div key={m.id} className="rounded-md border p-3" style={{ borderColor: "var(--accent)" }}>
                <OneOnOneFields value={editMeeting.form} onChange={(form) => setEditMeeting({ ...editMeeting, form })} people={people} />
                <div className="flex gap-2 mt-2">
                  <button className="btn btn-primary" disabled={busy === "meeting-edit"} onClick={saveMeeting}>Save</button>
                  <button className="btn btn-ghost" onClick={() => setEditMeeting(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div key={m.id} className="rounded-md border p-3 text-sm" style={rowBorder}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold">{m.date ?? "—"}</span>
                    {nameOf(m.personId) && <span style={muted}> · with {nameOf(m.personId)}</span>}
                  </div>
                  <div className="flex gap-3">
                    <SmallButton
                      onClick={() =>
                        setEditMeeting({
                          id: m.id,
                          form: { personId: m.personId?.toString() ?? "", date: m.date ?? "", notes: m.notes, actionItems: checklistToText(m.actionItems) },
                        })
                      }
                    >
                      edit
                    </SmallButton>
                    <SmallButton danger onClick={() => del("one-on-ones", m.id)}>delete</SmallButton>
                  </div>
                </div>
                {m.notes && <p className="mt-1 whitespace-pre-wrap">{m.notes}</p>}
                {m.actionItems.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {m.actionItems.map((a, i) => (
                      <li key={i}>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={a.done} onChange={() => toggleItem(m, i)} />
                          <span style={a.done ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{a.text}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
