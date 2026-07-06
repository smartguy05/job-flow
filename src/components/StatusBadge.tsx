import { STATUS_LABELS, statusColor } from "@/lib/ui";

export function StatusBadge({ status }: { status: string }) {
  const c = statusColor(status);
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
