"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/ui";

// Types and small helpers shared by the job page's tabs.

export type Job = {
  id: number;
  applicationId: number | null;
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  employmentType: string | null;
  locationMode: string | null;
  location: string | null;
  manager: string | null;
  team: string | null;
  technologies: string[];
  reasonForLeaving: string | null;
  notes: string | null;
  nextReviewDate: string | null;
  tenureMonths: number | null;
};
export type CompStep = {
  id: number;
  effectiveDate: string | null;
  kind: string;
  title: string | null;
  baseAmount: number | null;
  currency: string;
  period: string;
  bonus: string | null;
  equity: string | null;
  notes: string | null;
  changePct: number | null;
};
export type Benefits = {
  health: string | null;
  retirement: string | null;
  ptoDays: number | null;
  parentalLeave: string | null;
  remotePolicy: string | null;
  other: string | null;
};
export type Entry = {
  id: number;
  entryDate: string | null;
  kind: string;
  title: string;
  body: string;
  impact: string | null;
  technologies: string[];
  syncedAt: string | null;
};
export type Detail = {
  job: Job;
  compSummary: {
    steps: CompStep[];
    current: { baseAmount: number; currency: string; period: string } | null;
    totalGrowthPct: number | null;
  };
  benefits: Benefits | null;
  entries: Entry[];
  technologies: string[];
  currentManager: string | null;
  managerHistory: { id: number; name: string; title: string | null; startDate: string | null; endDate: string | null }[];
};
export type { ChecklistItem } from "@/lib/job-labels";

export type TabProps = { id: string; d: Detail; reload: () => Promise<unknown> };

// busy/error/flash state for a tab's async actions. `run` reloads the job afterwards.
export function useActions(reload: () => Promise<unknown>) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    setErr("");
    try {
      await fn();
      await reload();
      if (ok) {
        setMsg(ok);
        setTimeout(() => setMsg(""), 2000);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return { busy, err, msg, run };
}

export function Status({ err, msg }: { err: string; msg: string }) {
  if (!err && !msg) return null;
  return (
    <p className="text-sm mb-2" style={{ color: err ? "var(--danger)" : "var(--success)" }}>
      {err || msg}
    </p>
  );
}

export function SmallButton({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button className="text-xs hover:underline" style={{ color: danger ? "var(--danger)" : "var(--accent)" }} onClick={onClick}>
      {children}
    </button>
  );
}

export const muted = { color: "var(--muted)" } as const;
export const rowBorder = { borderColor: "var(--border)" } as const;

// Fetch a JSON list for a tab section; `refresh` re-fetches (and also reloads the job).
export function useList<T>(url: string): [T[], () => Promise<void>] {
  const [items, setItems] = useState<T[]>([]);
  const refresh = useCallback(async () => {
    setItems(await api<T[]>(url));
  }, [url]);
  useEffect(() => {
    api<T[]>(url).then(setItems).catch(() => setItems([]));
  }, [url]);
  return [items, refresh];
}
