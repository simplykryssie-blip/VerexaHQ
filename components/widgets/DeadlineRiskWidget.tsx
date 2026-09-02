import Link from "next/link";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import { Badge } from "@/components/ui/Badge";
import type { DeadlineRiskItem } from "@/lib/dashboard/data";

function dueLabel(daysRemaining: number) {
  if (daysRemaining < 0) return `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? "" : "s"} overdue`;
  if (daysRemaining === 0) return "Due today";
  return `Due in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;
}

export function DeadlineRiskWidget({ items }: { items: DeadlineRiskItem[] }) {
  return (
    <WidgetShell
      title="Deadline Risk"
      reportHref="/engagements"
      reportLabel="View Engagements"
      action={
        items.length > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">
            {items.length}
          </span>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyState icon={CalendarClock} message="Nothing due soon that isn't on track." />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <AlertTriangle size={16} className={`shrink-0 ${item.daysRemaining < 0 ? "text-danger" : "text-warning"}`} aria-hidden="true" />
              <Link href={`/engagements/${item.id}`} className="min-w-0 flex-1 hover:underline">
                <p className="truncate text-sm font-medium text-ink">{item.client_name}</p>
                <p className="truncate text-xs text-muted">{item.engagement_number ?? "Engagement"} &middot; {item.status}</p>
              </Link>
              <div className="shrink-0 text-right">
                <Badge tone={item.daysRemaining < 0 ? "danger" : "warning"}>{dueLabel(item.daysRemaining)}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}
