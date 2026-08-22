import { type LucideIcon, Construction } from "lucide-react";

export function ComingSoon({
  title,
  description,
  icon: Icon = Construction,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accentSoft text-accent">
          <Icon size={22} strokeWidth={2} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm text-muted">{description}</p>
        <span className="mt-4 inline-flex items-center rounded-full bg-surfaceMuted px-3 py-1 text-xs font-medium text-muted">
          Under development
        </span>
      </div>
    </div>
  );
}
