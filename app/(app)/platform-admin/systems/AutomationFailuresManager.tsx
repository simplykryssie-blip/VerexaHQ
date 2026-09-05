"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export type FailedAutomationRun = {
  run_id: string;
  workspace_id: string;
  workspace_name: string;
  automation_id: string;
  automation_name: string;
  failed_step_id: string | null;
  action_type: string | null;
  error_message: string | null;
  failed_at: string | null;
};

export function AutomationFailuresManager({ runs }: { runs: FailedAutomationRun[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [retrying, setRetrying] = useState<string | null>(null);

  async function retry(run: FailedAutomationRun) {
    setRetrying(run.run_id);
    const { error } = await supabase.rpc("retry_failed_automation_run", { p_run_id: run.run_id });
    setRetrying(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(`Retrying "${run.automation_name}" for ${run.workspace_name}`, "success");
    router.refresh();
  }

  if (runs.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface shadow-soft p-6 text-center text-sm text-muted">
        No failed automation runs right now.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-5 py-3 font-medium">When</th>
            <th className="px-5 py-3 font-medium">Workspace</th>
            <th className="px-5 py-3 font-medium">Automation</th>
            <th className="px-5 py-3 font-medium">Failed step</th>
            <th className="px-5 py-3 font-medium">Error</th>
            <th className="px-5 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {runs.map((run) => (
            <tr key={run.run_id} className="transition-colors hover:bg-surfaceMuted">
              <td className="whitespace-nowrap px-5 py-3 text-slate">{run.failed_at ? new Date(run.failed_at).toLocaleString() : "--"}</td>
              <td className="whitespace-nowrap px-5 py-3 text-slate">{run.workspace_name}</td>
              <td className="whitespace-nowrap px-5 py-3 text-slate">{run.automation_name}</td>
              <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate">{run.action_type ?? "--"}</td>
              <td className="max-w-md px-5 py-3 text-slate">{run.error_message ?? <span className="text-muted">--</span>}</td>
              <td className="whitespace-nowrap px-5 py-3">
                <button
                  type="button"
                  onClick={() => retry(run)}
                  disabled={retrying === run.run_id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent disabled:opacity-60"
                >
                  <RotateCw size={13} className={retrying === run.run_id ? "animate-spin" : ""} aria-hidden="true" />
                  Retry
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
