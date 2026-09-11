import Link from "next/link";
import { UserX, CircleCheck } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import { Badge } from "@/components/ui/Badge";
import type { UnassignedEngagementItem } from "@/lib/dashboard/data";

export function UnassignedEngagementsWidget({ items }: { items: UnassignedEngagementItem[] }) {
  return (
    <WidgetShell
      title="Unassigned Engagements"
      reportHref="/assignments?tab=engagements&filter=unassigned"
      reportLabel="Assign staff"
      action={
        items.length > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">
            {items.length}
          </span>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyState icon={CircleCheck} message="Every open engagement has an owner." />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <UserX size={16} className="shrink-0 text-warning" aria-hidden="true" />
              <Link href={`/engagements/${item.id}`} className="min-w-0 flex-1 hover:underline">
                <p className="truncate text-sm font-medium text-ink">{item.client_name}</p>
                <p className="truncate text-xs text-muted">{item.engagement_number ?? "Engagement"}</p>
              </Link>
              <div className="shrink-0 text-right">
                <Badge tone="warning">{item.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}
