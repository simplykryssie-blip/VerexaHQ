import type { LucideIcon } from "lucide-react";
import { WidgetShell } from "./WidgetShell";

const CHIP_CLASSES = {
  emerald: "bg-emeraldSoft text-emerald",
  accent: "bg-accentSoft text-accent",
  amber: "bg-amberSoft text-amber",
  rose: "bg-roseSoft text-rose",
  violet: "bg-violetSoft text-violet",
} as const;

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
  chip?: keyof typeof CHIP_CLASSES;
}) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-ink";
  return (
    <WidgetShell title={title} reportHref={reportHref}>
      {Icon && (
        <span className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${CHIP_CLASSES[chip]}`}>
          <Icon size={17} aria-hidden="true" />
        </span>
      )}
      <p className={`font-display text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </WidgetShell>
  );
}
