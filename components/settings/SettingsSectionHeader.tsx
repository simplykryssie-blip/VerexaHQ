import type { LucideIcon } from "lucide-react";

export function SettingsSectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accentSoft text-accent">
        <Icon size={18} strokeWidth={2} aria-hidden="true" />
      </span>
      <div>
        <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
    </div>
  );
}
