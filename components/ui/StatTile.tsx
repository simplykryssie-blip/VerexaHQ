import { IconChip, type IconChipTone } from "./IconChip";
import { Sparkline } from "./Sparkline";

/** A stat card: icon chip, label, big number, optional trend arrow or real
 * sparkline. Shared shell for anywhere a page shows a handful of top-line
 * counts (Documents, Clients Overview, the client portal dashboard). */
export function StatTile({
  icon: Icon,
  tone = "accent",
  label,
  value,
  trend,
  sparkline,
}: {
  icon: React.ElementType;
  tone?: IconChipTone;
  label: string;
  value: React.ReactNode;
  /** Only pass this when there's a real, computed comparison -- omit rather than invent a number. */
  trend?: { direction: "up" | "down"; label: string; sentiment?: "positive" | "negative" };
  /** Only pass this when a genuine day-by-day series exists -- omit rather than invent one. */
  sparkline?: number[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-4 transition hover:shadow-softHover">
      <div className="flex items-start justify-between gap-2">
        <IconChip tone={tone}>
          <Icon size={16} aria-hidden="true" />
        </IconChip>
        {sparkline && sparkline.length > 1 && <Sparkline points={sparkline} tone={tone} />}
      </div>
      <p className="mt-3 text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink">{value}</p>
      {trend &&
        (() => {
          const sentiment = trend.sentiment ?? (trend.direction === "up" ? "positive" : "negative");
          return (
            <p className={`mt-1 text-xs font-medium ${sentiment === "positive" ? "text-success" : "text-danger"}`}>
              {trend.direction === "up" ? "↑" : "↓"} {trend.label}
            </p>
          );
        })()}
    </div>
  );
}
