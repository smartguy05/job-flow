"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, fmtDate } from "@/lib/ui";
import type { OfferTable } from "@/lib/offer-comparison";
import type { OfferComparisonVerdict } from "@/lib/offer-comparison-content";

type Comparison = {
  id: number;
  title: string | null;
  applicationIds: number[];
  priorities: string | null;
  result: { table: OfferTable; verdict: OfferComparisonVerdict };
  createdAt: string;
};

export default function ComparisonDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<Comparison | null>(null);

  const load = useCallback(async () => {
    setC(await api<Comparison>(`/api/offers/comparisons/${id}`));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function del() {
    if (!confirm("Delete this comparison?")) return;
    await api(`/api/offers/comparisons/${id}`, { method: "DELETE" });
    router.push("/offers");
  }

  if (!c) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  const { table, verdict } = c.result;
  const nameFor = (appId: number) => {
    const a = table.applications.find((x) => x.id === appId);
    return a ? a.company || a.roleTitle : `#${appId}`;
  };
  const recommended = verdict.recommendation ? nameFor(verdict.recommendation.applicationId) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/offers" className="text-sm hover:underline" style={{ color: "var(--muted)" }}>← All comparisons</Link>
        <div className="flex items-start justify-between mt-2 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{c.title || `Comparison #${c.id}`}</h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>{fmtDate(c.createdAt)}</p>
          </div>
          <button className="btn btn-danger" onClick={del}>Delete</button>
        </div>
      </div>

      {/* Recommendation */}
      {recommended && (
        <section className="card p-5" style={{ borderLeft: "4px solid var(--accent)" }}>
          <div className="text-sm font-semibold" style={{ color: "var(--accent)" }}>Recommended: {recommended}</div>
          {verdict.recommendation.rationale && <p className="text-sm mt-1">{verdict.recommendation.rationale}</p>}
          {verdict.summary && <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{verdict.summary}</p>}
        </section>
      )}

      {c.priorities && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          <span className="font-semibold">Your priorities:</span> {c.priorities}
        </p>
      )}

      {/* Side-by-side table */}
      <section className="card p-5">
        <h2 className="font-semibold text-lg mb-3">Side by side</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2" style={{ color: "var(--muted)" }}></th>
                {table.applications.map((a) => (
                  <th key={a.id} className="text-left p-2 align-bottom" style={{ minWidth: 160 }}>
                    <Link href={`/applications/${a.id}`} className="underline" style={{ color: "var(--accent)" }}>
                      {a.company || a.roleTitle}
                    </Link>
                    <div className="text-xs font-normal" style={{ color: "var(--muted)" }}>{a.roleTitle}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.label} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="p-2 font-medium whitespace-nowrap" style={{ color: "var(--muted)" }}>{row.label}</td>
                  {row.values.map((v, i) => (
                    <td key={i} className="p-2 align-top">{v ?? <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Ranking */}
        {verdict.ranking?.length > 0 && (
          <section className="card p-5">
            <h2 className="font-semibold text-lg mb-3">Ranking</h2>
            <ol className="flex flex-col gap-2">
              {[...verdict.ranking].sort((a, b) => a.rank - b.rank).map((r) => (
                <li key={r.applicationId} className="flex gap-2 text-sm">
                  <span className="font-bold">{r.rank}.</span>
                  <div>
                    <span className="font-medium">{nameFor(r.applicationId)}</span>
                    {r.rationale && <span style={{ color: "var(--muted)" }}> — {r.rationale}</span>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Factors + risks */}
        <section className="card p-5">
          {verdict.factors?.length > 0 && (
            <>
              <h2 className="font-semibold text-lg mb-3">Key factors</h2>
              <ul className="flex flex-col gap-2 text-sm mb-4">
                {verdict.factors.map((f, i) => (
                  <li key={i}><span className="font-medium">{f.name}:</span> <span style={{ color: "var(--muted)" }}>{f.notes}</span></li>
                ))}
              </ul>
            </>
          )}
          {verdict.risks?.length > 0 && (
            <>
              <h3 className="font-semibold mb-2">Risks & watch-outs</h3>
              <ul className="list-disc pl-5 text-sm flex flex-col gap-1" style={{ color: "var(--danger)" }}>
                {verdict.risks.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
