import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock, Receipt } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import type { PriorityItem } from "@/lib/dashboard/priorities";

type PriorityStyle = { tint: string; iconColor: string; icon: LucideIcon; cta: string };

// Matched against PriorityItem.id's category prefix (see computeTodaysPriorities) --
// order matters, "review-exceeded-" must be checked before the shorter "review-" prefix.
const STYLES: [prefix: string, style: PriorityStyle][] = [
  ["review-exceeded-", { tint: "bg-warningSoft", iconColor: "text-warning", icon: Clock, cta: "Go to Review Queue" }],
  ["review-", { tint: "bg-dangerSoft", iconColor: "text-danger", icon: AlertCircle, cta: "Go to Review Queue" }],
  ["invoice-", { tint: "bg-warningSoft", iconColor: "text-warning", icon: Receipt, cta: "View Invoice" }],
  ["due-today-", { tint: "bg-successSoft", iconColor: "text-success", icon: CheckCircle2, cta: "View Task" }],
  ["task-", { tint: "bg-dangerSoft", iconColor: "text-danger", icon: AlertCircle, cta: "View Task" }],
];

function styleFor(id: string): PriorityStyle {
  return STYLES.find(([prefix]) => id.startsWith(prefix))?.[1] ?? { tint: "bg-surfaceMuted", iconColor: "text-muted", icon: AlertCircle, cta: "View" };
}

export function PrioritiesWidget({ items }: { items: PriorityItem[] }) {
  return (
    <WidgetShell title="Today's Priorities">
      {items.length === 0 ? (
        <EmptyState icon={CheckCircle2} message="Nothing urgent -- you're caught up." />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const style = styleFor(item.id);
            const Icon = style.icon;
            return (
              <li key={item.id} className={`flex items-center gap-3 rounded-xl p-3 ${style.tint}`}>
                <Icon size={16} className={`shrink-0 ${style.iconColor}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{item.label}</p>
                  <p className="truncate text-xs text-muted">{item.detail}</p>
                </div>
                <Link href={item.href} className={`shrink-0 text-xs font-medium hover:underline ${style.iconColor}`}>
                  {style.cta} →
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetShell>
  );
}
