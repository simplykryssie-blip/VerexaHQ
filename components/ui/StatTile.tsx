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
  onClick,
}: {
  icon: React.ElementType;
  tone?: IconChipTone;
  label: string;
  value: React.ReactNode;
  /** Only pass this when there's a real, computed comparison -- omit rather than invent a number. */
  trend?: { direction: "up" | "down"; label: string; sentiment?: "positive" | "negative" };
  /** Only pass this when a genuine day-by-day series exists -- omit rather than invent one. */
  sparkline?: number[];
  /** Makes the tile a button that opens whatever it's summarizing (e.g. Open tasks -> the task list) instead of a static number. */
  onClick?: () => void;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`w-full rounded-2xl border border-border bg-surface shadow-soft p-4 text-left transition hover:shadow-softHover ${onClick ? "cursor-pointer hover:border-accent" : ""}`}
    >
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
    </Wrapper>
  );
}
