"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { XCircle, CircleCheck, Check } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import type { FailedAutomationRunItem } from "@/lib/dashboard/data";

export function FailedAutomationRunsWidget({ items }: { items: FailedAutomationRunItem[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const visible = items.filter((item) => !dismissedIds.has(item.id));

  // Acknowledging never changes the run's own status -- it stays "failed" in
  // that automation's permanent Activity history either way. This just
  // clears it from the live dashboard queue once someone's looked at it, so
  // an old failure doesn't sit here forever regardless of whether the
  // underlying automation was actually fixed.
  async function acknowledge(id: string) {
    setAcknowledging(id);
    const { error } = await supabase.rpc("acknowledge_automation_run", { p_run_id: id });
    setAcknowledging(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setDismissedIds((prev) => new Set(prev).add(id));
    router.refresh();
  }

  return (
    <WidgetShell
      title="Failed Automation Runs"
      reportHref="/workflows"
      reportLabel="View Workflows"
      action={
        visible.length > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">
            {visible.length}
          </span>
        ) : undefined
      }
    >
      {visible.length === 0 ? (
        <EmptyState icon={CircleCheck} message="No unacknowledged automation failures." />
      ) : (
        <ul className="space-y-2">
          {visible.map((item) => (
            <li key={item.id} className="flex items-start gap-3">
              <XCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
              <Link href={`/workflows/${item.automation_id}?activity=1`} className="min-w-0 flex-1 hover:underline">
                <p className="truncate text-sm font-medium text-ink">{item.automation_name}</p>
                <p className="truncate text-xs text-muted">{item.error_message ?? "No error detail recorded"}</p>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <div className="text-right">
                  <Badge tone="danger">Failed</Badge>
                  {item.completed_at && <p className="mt-1 text-[11px] text-muted">{new Date(item.completed_at).toLocaleDateString()}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => acknowledge(item.id)}
                  disabled={acknowledging === item.id}
                  aria-label="Acknowledge and remove from this list"
                  title="Acknowledge and remove from this list"
                  className="rounded p-1 text-muted transition hover:bg-successSoft hover:text-success disabled:opacity-40"
                >
                  <Check size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}
