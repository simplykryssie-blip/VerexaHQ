const colorMap: Record<string, string> = {
  "on-track": "#0EA5A0",
  "lead": "#64748B",
  "active": "#0EA5A0",
  "inactive": "#64748B",
  "to do": "#64748B",
  "in progress": "#B45309",
  "done": "#0EA5A0",
  "upcoming": "#64748B",
  "due soon": "#B45309",
  "past due": "#B3261E",
  "completed": "#0EA5A0",
  "new": "#64748B",
  "not started": "#64748B",
  "gathering documents": "#B45309",
  "in review": "#B45309",
  "ready to file": "#B45309",
  "filed": "#0EA5A0",
  "amended": "#B3261E",
  "pending": "#64748B",
  "paid": "#0EA5A0",
  "late": "#B3261E",
  "waived": "#64748B",
  "draft": "#64748B",
  "sent": "#B45309",
  "submitted": "#B45309",
  "reviewed": "#B45309",
  "accepted": "#0EA5A0",
  "open": "#B45309",
  "closed": "#0EA5A0",
  "reconciled": "#0EA5A0",
  "needs cleanup": "#B3261E",
  "cleanup": "#B3261E",
  "paused": "#64748B",
  "offboarding": "#B3261E",
  "uncategorized": "#B45309",
  "categorized": "#0EA5A0",
  "invited": "#B45309",
  "disabled": "#B3261E",
  "in_progress": "#B45309",
  "blocked": "#B3261E",
  "waiting on firm": "#B45309",
  "waiting on client": "#B45309",
  "resolved": "#0EA5A0",
  "needed": "#64748B",
  "requested": "#B45309",
  "received": "#B45309",
  "under review": "#B45309",
  "not applicable": "#64748B",
  "setup": "#64748B",
  "on hold": "#B45309",
  "processed": "#0EA5A0",
  "on leave": "#B45309",
  "terminated": "#B3261E",
  "scheduled": "#64748B",
  "partially paid": "#B45309",
  "void": "#64748B",
  "ready for review": "#B45309",
  "delivered": "#0EA5A0",
  "client viewed": "#0EA5A0",
  "archived": "#64748B",
  "not activated": "#64748B",
  "activated": "#0EA5A0",
};

export default function StatusPill({ status }: { status: string }) {
  const key = status.toLowerCase();
  const color = colorMap[key] || "#64748B";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-semibold uppercase tracking-wide border font-mono"
      style={{
        color,
        borderColor: color,
        backgroundColor: `${color}14`,
      }}
    >
      {status}
    </span>
  );
}
