import Link from "next/link";
import { Clock, CircleCheck } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import { Badge } from "@/components/ui/Badge";
import type { OverdueRequestItem } from "@/lib/dashboard/data";

function daysOverdue(dueDate: string) {
  const days = Math.round((Date.now() - new Date(dueDate).getTime()) / (24 * 60 * 60 * 1000));
  return `${days} day${days === 1 ? "" : "s"} overdue`;
}

export function OverdueRequestsWidget({ items }: { items: OverdueRequestItem[] }) {
  return (
    <WidgetShell
      title="Overdue Client Requests"
      reportHref="/reports/documents?report=missing"
      reportLabel="View Documents"
      action={
        items.length > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">
            {items.length}
          </span>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyState icon={CircleCheck} message="No open request is past its due date." />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <Clock size={16} className="shrink-0 text-danger" aria-hidden="true" />
              <Link href={item.entityHref} className="min-w-0 flex-1 hover:underline">
                <p className="truncate text-sm font-medium text-ink">{item.entityLabel}</p>
                <p className="truncate text-xs text-muted">{item.title}</p>
              </Link>
              <div className="shrink-0 text-right">
                <Badge tone="danger">{daysOverdue(item.due_date)}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}
