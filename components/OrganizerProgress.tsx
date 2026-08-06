"use client";

// Shared progress bar + encouraging copy for the client portal and staff
// organizer-fill pages, per the Client-First System Template Experience
// standard ("Progress" and "Encouraging Language" sections). Never
// intimidating -- no raw counts-only display, always a percentage and a
// short human line.
function encouragingLine(pct: number): string {
  if (pct >= 100) return "You're all done! Nice work.";
  if (pct >= 75) return "Almost done — just a bit more.";
  if (pct >= 50) return "You're halfway finished.";
  if (pct > 0) return "You're doing great — keep going.";
  return "Let's get started. This won't take long.";
}

export default function OrganizerProgress({
  answeredCount,
  totalCount,
}: {
  answeredCount: number;
  totalCount: number;
}) {
  const pct = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;
  return (
    <div className="mb-8">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between text-xs text-muted mb-1.5">
        <span>{encouragingLine(pct)}</span>
        <span className="tabular-nums">{pct}% complete</span>
      </div>
      <div className="h-2 w-full rounded-full bg-paperDim overflow-hidden">
        <div className="h-full bg-ink rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
