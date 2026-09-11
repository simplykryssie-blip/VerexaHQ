import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { IconChip, type IconChipTone } from "@/components/ui/IconChip";

// direction picks the arrow icon; sentiment picks the color, since "down" isn't
// always bad (fewer overdue tasks is good news) -- defaults to matching
// direction (up = positive) when the caller doesn't need to override it.
export type KpiTrend = { direction: "up" | "down"; label: string; sentiment?: "positive" | "negative" };

export function KpiWidget({
  title,
  value,
  tone = "default",
  reportHref,
  icon: Icon,
  chip = "accent",
  trend,
}: {
  title: string;
  value: string;
  tone?: "default" | "warning" | "danger";
  reportHref?: string;
  icon?: LucideIcon;
  chip?: IconChipTone;
  /** Only pass this when there's a real, computed comparison -- omit rather than invent a number for a metric with no historical baseline. */
  trend?: KpiTrend;
}) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-ink";
  return (
    <WidgetShell title={title} reportHref={reportHref}>
      {Icon && (
        <IconChip tone={chip} className="mb-3">
          <Icon size={17} aria-hidden="true" />
        </IconChip>
      )}
      <p className={`font-display text-2xl font-semibold tabular-nums tracking-tight ${toneClass}`}>{value}</p>
      {trend &&
        (() => {
          const sentiment = trend.sentiment ?? (trend.direction === "up" ? "positive" : "negative");
          return (
            <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${sentiment === "positive" ? "text-success" : "text-danger"}`}>
              {trend.direction === "up" ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
              {trend.label}
            </p>
          );
        })()}
    </WidgetShell>
  );
}
