import type { LucideIcon } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { IconChip, type IconChipTone } from "@/components/ui/IconChip";

export function KpiWidget({
  title,
  value,
  tone = "default",
  reportHref,
  icon: Icon,
  chip = "accent",
}: {
  title: string;
  value: string;
  tone?: "default" | "warning" | "danger";
  reportHref?: string;
  icon?: LucideIcon;
  chip?: IconChipTone;
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
    </WidgetShell>
  );
}
