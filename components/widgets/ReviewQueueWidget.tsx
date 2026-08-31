import Link from "next/link";
import { Inbox } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import { Avatar } from "@/components/Avatar";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { ReviewItem } from "@/lib/dashboard/data";

export function ReviewQueueWidget({ items }: { items: ReviewItem[] }) {
  return (
    <WidgetShell
      title="Review Queue"
      reportHref="/review-queue"
      reportLabel="View Review Queue"
      action={
        items.length > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">
            {items.length}
          </span>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyState icon={Inbox} message="Nothing waiting on review." />
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 5).map((item) => {
            // The pill is the actual review stage, not the SLA -- SLA only
            // picks the pill's urgency tone (overdue/exceeded reads as a
            // problem, everything else as a routine in-progress state).
            const tone: BadgeTone = item.sla_category === "Overdue" || item.sla_category === "Exceeded" ? "warning" : "accent";
            return (
              <li key={item.workflow_stage_id} className="flex items-start gap-3">
                <Avatar name={item.client_name} url={null} size="sm" />
                <Link href={`/clients/${item.client_id}`} className="min-w-0 flex-1 hover:underline">
                  <p className="truncate text-sm font-medium text-ink">{item.client_name}</p>
                  <p className="truncate text-xs text-muted">{item.service_name ?? item.engagement_number ?? "Engagement"}</p>
                </Link>
                <div className="shrink-0 text-right">
                  <Badge tone={tone}>{item.stage_name}</Badge>
                  {item.started_at && <p className="mt-1 text-[11px] text-muted">Started {new Date(item.started_at).toLocaleDateString()}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetShell>
  );
}
