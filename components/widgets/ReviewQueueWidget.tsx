import Link from "next/link";
import { Inbox } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import type { ReviewItem } from "@/lib/dashboard/data";

export function ReviewQueueWidget({ items }: { items: ReviewItem[] }) {
  return (
    <WidgetShell title="Review Queue">
      {items.length === 0 ? (
        <EmptyState icon={Inbox} message="Nothing waiting on review." />
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 5).map((item) => (
            <li key={item.workflow_stage_id} className="flex items-center justify-between text-sm">
              <Link href={`/clients/${item.client_id}`} className="text-slate hover:underline">
                {item.stage_name} -- {item.engagement_number ?? "Engagement"}
              </Link>
              <span className={`text-xs ${item.sla_category === "Overdue" ? "text-danger" : "text-muted"}`}>
                {item.sla_category}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}
