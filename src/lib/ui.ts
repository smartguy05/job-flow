export const STATUS_LABELS: Record<string, string> = {
  applied: "Applied",
  in_progress: "In progress",
  closed_won: "Closed — Won",
  closed_lost: "Closed — Lost",
  expired: "Expired",
};

export const STATUS_ORDER = ["applied", "in_progress", "closed_won", "closed_lost", "expired"];

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
    case "expired":
      return { bg: "#e5e7eb", fg: "#4b5563" };
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

// Convert a stored ISO timestamp to the `YYYY-MM-DDTHH:mm` shape a datetime-local input
// wants, in the viewer's local time. Returns "" when there's no scheduled time.
export function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Inverse of toDateTimeLocal: turn the timezone-naive value of a datetime-local input
// (e.g. "2026-07-08T14:30") into a true UTC instant. `new Date(naive)` interprets the
// string in the runtime's local zone — on the client that's the user's browser zone — so
// this must run client-side to capture the intended instant. Returns null for empty input.
export function fromDateTimeLocal(local: string): string | null {
  return local ? new Date(local).toISOString() : null;
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
