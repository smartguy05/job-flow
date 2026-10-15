"use client";

import { useState } from "react";
import { api } from "@/lib/ui";
import { COMP_KIND_LABELS, GOAL_STATUS_LABELS, checklistToText, textToChecklist } from "@/lib/job-labels";
import { SmallButton, Status, muted, rowBorder, useActions, useList, type ChecklistItem, type CompStep } from "./shared";

type Review = {
  id: number;
  cycle: string;
  periodStart: string | null;
  periodEnd: string | null;
  rating: string | null;
  reviewer: string | null;
  summary: string | null;
  strengths: string | null;
  growthAreas: string | null;
  outcome: string | null;
  compensationId: number | null;
};
type Goal = {
  id: number;
  title: string;
  description: string | null;
  period: string | null;
  status: string;
  progress: number;
  keyResults: ChecklistItem[];
};

const REVIEW_TEXT: [keyof ReviewForm, string][] = [
  ["summary", "Summary"],
  ["strengths", "Strengths"],
  ["growthAreas", "Growth areas"],
  ["outcome", "Outcome (private: raise, promotion…)"],
];
const EMPTY_REVIEW = {
  cycle: "", periodStart: "", periodEnd: "", rating: "", reviewer: "", summary: "", strengths: "", growthAreas: "", outcome: "", compensationId: "",
};
type ReviewForm = typeof EMPTY_REVIEW;
const EMPTY_GOAL = { title: "", description: "", period: "", status: "active", progress: "0", keyResults: "" };
type GoalForm = typeof EMPTY_GOAL;

const reviewForm = (r: Review): ReviewForm =>
  Object.fromEntries(Object.keys(EMPTY_REVIEW).map((k) => [k, r[k as keyof Review]?.toString() ?? ""])) as ReviewForm;
const reviewBody = (f: ReviewForm) => ({ ...f, compensationId: f.compensationId ? Number(f.compensationId) : null });
const goalForm = (g: Goal): GoalForm => ({
  title: g.title,
  description: g.description ?? "",
  period: g.period ?? "",
  status: g.status,
  progress: String(g.progress),
  keyResults: checklistToText(g.keyResults),
});
const goalBody = (f: GoalForm) => ({ ...f, keyResults: textToChecklist(f.keyResults) });

function ReviewFields({ value, onChange, comp }: { value: ReviewForm; onChange: (v: ReviewForm) => void; comp: CompStep[] }) {
  const set = (k: keyof ReviewForm) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <input className="input" placeholder="Cycle (e.g. 2026 mid-year)" value={value.cycle} onChange={set("cycle")} />
      <input type="date" className="input" title="Period start" value={value.periodStart} onChange={set("periodStart")} />
      <input type="date" className="input" title="Period end" value={value.periodEnd} onChange={set("periodEnd")} />
      <input className="input" placeholder="Rating" value={value.rating} onChange={set("rating")} />
      <input className="input" placeholder="Reviewer" value={value.reviewer} onChange={set("reviewer")} />
      <select className="select" value={value.compensationId} onChange={set("compensationId")}>
        <option value="">Linked pay change (optional)</option>
        {comp.map((c) => (
          <option key={c.id} value={c.id}>{c.effectiveDate ?? "—"} · {COMP_KIND_LABELS[c.kind] ?? c.kind}</option>
        ))}
      </select>
      {REVIEW_TEXT.map(([k, label]) => (
        <textarea key={k} className="textarea sm:col-span-3" rows={2} placeholder={label} value={value[k]} onChange={set(k)} />
      ))}
    </div>
  );
}

function GoalFields({ value, onChange }: { value: GoalForm; onChange: (v: GoalForm) => void }) {
  const set = (k: keyof GoalForm) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      <input className="input sm:col-span-2" placeholder="Goal" value={value.title} onChange={set("title")} />
      <input className="input" placeholder="Period (e.g. 2026-H2)" value={value.period} onChange={set("period")} />
      <select className="select" value={value.status} onChange={set("status")}>
        {Object.entries(GOAL_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <textarea className="textarea sm:col-span-3" rows={2} placeholder="Description" value={value.description} onChange={set("description")} />
      <label className="text-sm">
        Progress: {value.progress}%
        <input type="range" min={0} max={100} step={5} className="w-full" value={value.progress} onChange={set("progress")} />
      </label>
      <textarea className="textarea sm:col-span-4" rows={2} placeholder="Key results, one per line ([x] = done)" value={value.keyResults}
        onChange={set("keyResults")} />
    </div>
  );
}

function BragDocPanel({ id, cycleHint }: { id: string; cycleHint: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cycle, setCycle] = useState(cycleHint);
  const [markdown, setMarkdown] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) });
  const url = (fmt: string) => `/api/jobs/${id}/brag-doc?${new URLSearchParams({ ...Object.fromEntries(qs), fmt })}`;

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const preview = () => act("preview", async () => setMarkdown((await api<{ markdown: string }>(url("json"))).markdown));
  const selfReview = () =>
    act("draft", async () => {
      const r = await api<{ draft: string; bragDoc: string }>(`/api/jobs/${id}/self-review`, {
        method: "POST",
        body: JSON.stringify({ from, to, cycle }),
      });
      setDraft(r.draft);
      setMarkdown(r.bragDoc);
    });

  return (
    <section className="card p-4">
      <h2 className="font-semibold mb-1">Brag doc & self-review</h2>
      <p className="text-sm mb-3" style={muted}>
        Built from achievements, feedback, reviews and goals. Complaints, notes, 1:1s, pay, equity and PTO are never
        included, and the AI self-review draft sees only the brag doc.
      </p>
      <div className="grid gap-2 sm:grid-cols-3 mb-3">
        <label className="text-sm">From<input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">To<input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="text-sm">Review cycle<input className="input" value={cycle} onChange={(e) => setCycle(e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <button className="btn btn-ghost" disabled={busy === "preview"} onClick={preview}>{busy === "preview" ? "Loading…" : "Preview"}</button>
        <a className="btn btn-ghost" href={url("md")} download="brag-doc.md">Download .md</a>
        <a className="btn btn-ghost" href={url("docx")}>Download .docx</a>
        <button className="btn btn-primary" disabled={busy === "draft"} onClick={selfReview}>
          {busy === "draft" ? "Drafting…" : "Draft self-review"}
        </button>
      </div>
      {err && <p className="text-sm mb-2" style={{ color: "var(--danger)" }}>{err}</p>}
      {markdown && <pre className="text-sm whitespace-pre-wrap rounded-md border p-3 mb-3" style={rowBorder}>{markdown}</pre>}
      {draft && (
        <>
          <label className="label">Self-review draft (edit before using — nothing is saved)</label>
          <textarea className="textarea" rows={14} value={draft} onChange={(e) => setDraft(e.target.value)} />
        </>
      )}
    </section>
  );
}

export function ReviewsGoalsTab({ id, comp, reload }: { id: string; comp: CompStep[]; reload: () => Promise<unknown> }) {
  const [reviews, refreshReviews] = useList<Review>(`/api/jobs/${id}/reviews`);
  const [goals, refreshGoals] = useList<Goal>(`/api/jobs/${id}/goals`);
  const [review, setReview] = useState(EMPTY_REVIEW);
  const [editReview, setEditReview] = useState<{ id: number; form: ReviewForm } | null>(null);
  const [goal, setGoal] = useState(EMPTY_GOAL);
  const [editGoal, setEditGoal] = useState<{ id: number; form: GoalForm } | null>(null);
  const { busy, err, msg, run } = useActions(async () => {
    await Promise.all([refreshReviews(), refreshGoals(), reload()]);
  });
  const base = `/api/jobs/${id}`;
  const send = (path: string, method: string, body?: unknown) =>
    api(`${base}/${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });

  return (
    <div className="flex flex-col gap-6">
      <Status err={err} msg={msg} />
      <section className="card p-4">
        <h2 className="font-semibold mb-3">Goals</h2>
        <div className="flex flex-col gap-2 mb-4">
          {goals.length === 0 && <p className="text-sm" style={muted}>No goals yet.</p>}
          {goals.map((g) =>
            editGoal?.id === g.id ? (
              <div key={g.id} className="rounded-md border p-3" style={{ borderColor: "var(--accent)" }}>
                <GoalFields value={editGoal.form} onChange={(form) => setEditGoal({ ...editGoal, form })} />
                <div className="flex gap-2 mt-2">
                  <button className="btn btn-primary" disabled={busy === "goal-edit"}
                    onClick={() => run("goal-edit", async () => { await send(`goals/${g.id}`, "PATCH", goalBody(editGoal.form)); setEditGoal(null); }, "Goal saved.")}>
                    Save
                  </button>
                  <button className="btn btn-ghost" onClick={() => setEditGoal(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div key={g.id} className="rounded-md border p-3 text-sm" style={rowBorder}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="badge mr-2" style={{ background: "var(--surface-2)" }}>{GOAL_STATUS_LABELS[g.status] ?? g.status}</span>
                    <span className="font-semibold">{g.title}</span>
                    {g.period && <span style={muted}> · {g.period}</span>}
                    <span style={muted}> · {g.progress}%</span>
                  </div>
                  <div className="flex gap-3">
                    <SmallButton onClick={() => setEditGoal({ id: g.id, form: goalForm(g) })}>edit</SmallButton>
                    <SmallButton danger onClick={() => run(`goal-${g.id}`, () => send(`goals/${g.id}`, "DELETE"))}>delete</SmallButton>
                  </div>
                </div>
                <div className="h-1.5 rounded mt-2" style={{ background: "var(--surface-2)" }}>
                  <div className="h-1.5 rounded" style={{ width: `${g.progress}%`, background: "var(--accent)" }} />
                </div>
                {g.description && <p className="mt-1 whitespace-pre-wrap">{g.description}</p>}
                {g.keyResults.length > 0 && (
                  <ul className="mt-1 list-disc pl-5">
                    {g.keyResults.map((k, i) => (
                      <li key={i} style={k.done ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{k.text}</li>
                    ))}
                  </ul>
                )}
              </div>
            ),
          )}
        </div>
        <div className="rounded-md border p-3" style={rowBorder}>
          <GoalFields value={goal} onChange={setGoal} />
          <button className="btn btn-primary mt-2" disabled={busy === "goal" || !goal.title.trim()}
            onClick={() => run("goal", async () => { await send("goals", "POST", goalBody(goal)); setGoal(EMPTY_GOAL); })}>
            {busy === "goal" ? "Adding…" : "Add goal"}
          </button>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-3">Performance reviews</h2>
        <div className="flex flex-col gap-2 mb-4">
          {reviews.length === 0 && <p className="text-sm" style={muted}>No reviews yet.</p>}
          {reviews.map((r) =>
            editReview?.id === r.id ? (
              <div key={r.id} className="rounded-md border p-3" style={{ borderColor: "var(--accent)" }}>
                <ReviewFields value={editReview.form} onChange={(form) => setEditReview({ ...editReview, form })} comp={comp} />
                <div className="flex gap-2 mt-2">
                  <button className="btn btn-primary" disabled={busy === "review-edit"}
                    onClick={() => run("review-edit", async () => { await send(`reviews/${r.id}`, "PATCH", reviewBody(editReview.form)); setEditReview(null); }, "Review saved.")}>
                    Save
                  </button>
                  <button className="btn btn-ghost" onClick={() => setEditReview(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div key={r.id} className="rounded-md border p-3 text-sm" style={rowBorder}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold">{r.cycle}</span>
                    {r.rating && <span className="badge ml-2" style={{ background: "var(--surface-2)" }}>{r.rating}</span>}
                    {(r.periodStart || r.periodEnd) && <span style={muted}> · {r.periodStart ?? "?"} – {r.periodEnd ?? "?"}</span>}
                    {r.reviewer && <span style={muted}> · by {r.reviewer}</span>}
                  </div>
                  <div className="flex gap-3">
                    <SmallButton onClick={() => setEditReview({ id: r.id, form: reviewForm(r) })}>edit</SmallButton>
                    <SmallButton danger onClick={() => run(`review-${r.id}`, () => send(`reviews/${r.id}`, "DELETE"))}>delete</SmallButton>
                  </div>
                </div>
                {REVIEW_TEXT.map(([k, label]) =>
                  r[k as keyof Review] ? (
                    <p key={k} className="mt-1 whitespace-pre-wrap"><span style={muted}>{label.split(" (")[0]}:</span> {r[k as keyof Review]}</p>
                  ) : null,
                )}
              </div>
            ),
          )}
        </div>
        <div className="rounded-md border p-3" style={rowBorder}>
          <ReviewFields value={review} onChange={setReview} comp={comp} />
          <button className="btn btn-primary mt-2" disabled={busy === "review" || !review.cycle.trim()}
            onClick={() => run("review", async () => { await send("reviews", "POST", reviewBody(review)); setReview(EMPTY_REVIEW); })}>
            {busy === "review" ? "Adding…" : "Add review"}
          </button>
        </div>
      </section>

      <BragDocPanel id={id} cycleHint={reviews[0]?.cycle ?? ""} />
    </div>
  );
}
