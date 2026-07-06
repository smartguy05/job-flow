export const STATUS_LABELS: Record<string, string> = {
  applied: "Applied",
  in_progress: "In progress",
  closed_won: "Closed — Won",
  closed_lost: "Closed — Lost",
};

export const STATUS_ORDER = ["applied", "in_progress", "closed_won", "closed_lost"];

export function statusColor(status: string): { bg: string; fg: string } {
  switch (status) {
    case "applied":
      return { bg: "#dbeafe", fg: "#1e40af" };
    case "in_progress":
      return { bg: "#fef3c7", fg: "#92400e" };
    case "closed_won":
      return { bg: "#d1fae5", fg: "#065f46" };
    case "closed_lost":
      return { bg: "#fee2e2", fg: "#991b1b" };
    default:
      return { bg: "#e2e8f0", fg: "#334155" };
  }
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function fmtRelative(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const days = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return fmtDate(date);
}

export async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}
