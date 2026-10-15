"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/ui";
import { JOB_TABS, formatTenure, jobTabFromHash, type JobTab } from "@/lib/job-labels";
import type { Detail } from "./_components/shared";
import { OverviewTab } from "./_components/OverviewTab";
import { PayTab } from "./_components/PayTab";
import { PeopleTab } from "./_components/PeopleTab";
import { ReviewsGoalsTab } from "./_components/ReviewsGoalsTab";
import { JournalTab } from "./_components/JournalTab";

// Job detail: a header plus tabs (Overview, Pay, People & 1:1s, Reviews & Goals, Journal).
// Each tab is its own component under ./_components; the active tab lives in the URL hash.
export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState<JobTab>("overview");

  const load = useCallback(() => api<Detail>(`/api/jobs/${id}`).then(setD), [id]);
  useEffect(() => {
    api<Detail>(`/api/jobs/${id}`).then(setD);
  }, [id]);
  useEffect(() => {
    const sync = () => setTab(jobTabFromHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  function select(t: JobTab) {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  }

  async function delJob() {
    if (!confirm("Delete this job and all its pay, benefits, people, 1:1s, reviews, goals and journal entries?")) return;
    await api(`/api/jobs/${id}`, { method: "DELETE" });
    window.location.href = "/jobs";
  }

  if (!d) return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/jobs" className="text-sm hover:underline" style={{ color: "var(--muted)" }}>← All jobs</Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mt-2">
          <div>
            <h1 className="text-2xl font-bold">{d.job.title}</h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {d.job.company} · {d.job.startDate ?? "?"} – {d.job.endDate ?? "present"}
              {d.job.tenureMonths != null && ` · ${formatTenure(d.job.tenureMonths)}`}
              {d.currentManager && ` · reports to ${d.currentManager}`}
              {d.job.nextReviewDate && ` · next review ${d.job.nextReviewDate}`}
              {d.job.applicationId && (
                <> · <Link href={`/applications/${d.job.applicationId}`} className="hover:underline" style={{ color: "var(--accent)" }}>original application</Link></>
              )}
            </p>
          </div>
          <button className="btn btn-danger" onClick={delJob}>Delete</button>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border)" }} role="tablist">
        {JOB_TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className="px-3 py-2 text-sm -mb-px border-b-2"
            style={{
              borderColor: tab === key ? "var(--accent)" : "transparent",
              color: tab === key ? "var(--foreground)" : "var(--muted)",
              fontWeight: tab === key ? 600 : 400,
            }}
            onClick={() => select(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab id={id} d={d} reload={load} />}
      {tab === "pay" && <PayTab id={id} d={d} reload={load} />}
      {tab === "people" && <PeopleTab id={id} reload={load} />}
      {tab === "reviews" && <ReviewsGoalsTab id={id} comp={d.compSummary.steps} reload={load} />}
      {tab === "journal" && <JournalTab id={id} d={d} reload={load} />}
    </div>
  );
}
