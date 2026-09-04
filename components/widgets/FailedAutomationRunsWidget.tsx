import Link from "next/link";
import { XCircle, CircleCheck } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import { Badge } from "@/components/ui/Badge";
import type { FailedAutomationRunItem } from "@/lib/dashboard/data";

export function FailedAutomationRunsWidget({ items }: { items: FailedAutomationRunItem[] }) {
  return (
    <WidgetShell
      title="Failed Automation Runs"
      reportHref="/workflows"
      reportLabel="View Workflows"
      action={
        items.length > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">
            {items.length}
          </span>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyState icon={CircleCheck} message="No automation has failed recently." />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3">
              <XCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
              <Link href={`/workflows/${item.automation_id}?activity=1`} className="min-w-0 flex-1 hover:underline">
                <p className="truncate text-sm font-medium text-ink">{item.automation_name}</p>
                <p className="truncate text-xs text-muted">{item.error_message ?? "No error detail recorded"}</p>
              </Link>
              <div className="shrink-0 text-right">
                <Badge tone="danger">Failed</Badge>
                {item.completed_at && <p className="mt-1 text-[11px] text-muted">{new Date(item.completed_at).toLocaleDateString()}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}
