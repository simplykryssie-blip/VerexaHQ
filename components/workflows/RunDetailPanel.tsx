"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, MinusCircle, X, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { actionIcon, ACTION_TYPES } from "@/components/workflows/WorkflowBuilder";

type RunHeader = {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  engagement_number: string | null;
  client_name: string | null;
};

type LogRow = {
  id: string;
  status: string;
  executed_at: string | null;
  error_message: string | null;
  action_type: string | null;
  skipped_reason: string | null;
};

function actionLabel(actionType: string | null) {
  if (!actionType) return "Step";
  if (actionType === "business_hours_delay") return "Wait / Delay (business hours)";
  return ACTION_TYPES.find((a) => a.value === actionType)?.label ?? actionType;
}

function clientLabelFor(c: { first_name: string | null; last_name: string | null; business_name: string | null } | null) {
  if (!c) return null;
  return c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
}

// The single "click a client, see exactly where they are" surface -- opened
// either from a live ticker on the canvas or a row in the Recent runs table,
// so both entry points land on the same view instead of two half-features.
// Fetches fresh on open rather than trusting whatever the server component
// last passed down, since a run this panel is opened for is often actively
// still executing.
export function RunDetailPanel({ runId, onClose }: { runId: string; onClose: () => void }) {
  const supabase = createClient();
  const [run, setRun] = useState<RunHeader | null>(null);
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRun(null);
    setLogs(null);
    setError(null);

    async function load() {
      const [{ data: runRow, error: runError }, { data: logRows, error: logsError }] = await Promise.all([
        supabase
          .from("automation_runs")
          .select("id, status, started_at, completed_at, engagements(engagement_number), clients(first_name, last_name, business_name)")
          .eq("id", runId)
          .maybeSingle(),
        supabase
          .from("automation_execution_logs")
          .select("id, status, executed_at, execution_data, error_message")
          .eq("execution_data->>run_id", runId)
          .order("executed_at", { ascending: true }),
      ]);
      if (cancelled) return;

      if (runError || !runRow) {
        setError(runError?.message ?? "This run could not be found.");
        return;
      }
      setRun({
        id: runRow.id,
        status: runRow.status,
        started_at: runRow.started_at,
        completed_at: runRow.completed_at,
        engagement_number: (runRow.engagements as unknown as { engagement_number: string | null } | null)?.engagement_number ?? null,
        client_name: clientLabelFor(runRow.clients as unknown as { first_name: string | null; last_name: string | null; business_name: string | null } | null),
      });

      if (logsError) {
        setError(logsError.message);
        return;
      }
      setLogs(
        (logRows ?? []).map((l) => {
          const data = (l.execution_data ?? {}) as { action_type?: string; skipped_reason?: string };
          return {
            id: l.id,
            status: l.status,
            executed_at: l.executed_at,
            error_message: l.error_message,
            action_type: data.action_type ?? null,
            skipped_reason: data.skipped_reason ?? null,
          };
        })
      );
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [runId, supabase]);

  const title = run?.client_name ?? run?.engagement_number ?? "This run";

  return (
    <div role="dialog" aria-modal="true" aria-label="Run detail" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accentSoft text-accent">
              <User size={16} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-ink">{title}</h2>
              {run && (
                <p className="text-xs text-muted">
                  {run.status === "running" ? "In progress" : run.status === "failed" ? "Failed" : run.status === "completed" ? "Completed" : run.status}
                  {" · started "}
                  {new Date(run.started_at).toLocaleString()}
                  {run.completed_at ? ` · finished ${new Date(run.completed_at).toLocaleString()}` : ""}
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 text-muted hover:text-ink">
            <X size={16} />
          </button>
        </div>

        {error && <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}

        {!error && !logs && <p className="text-sm text-muted">Loading&hellip;</p>}

        {!error && logs && (
          logs.length === 0 ? (
            <p className="text-sm text-muted">No steps have executed for this run yet.</p>
          ) : (
            <ol className="space-y-2">
              {logs.map((l) => (
                <li key={l.id} className="flex items-start gap-2.5 rounded-xl border border-border bg-surfaceMuted px-3 py-2.5">
                  <span className="mt-0.5 shrink-0 text-muted">{actionIcon(l.action_type ?? "")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink">{actionLabel(l.action_type)}</p>
                      {l.status === "completed" && !l.skipped_reason ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success">
                          <CheckCircle2 size={13} /> Completed
                        </span>
                      ) : l.status === "failed" ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-danger">
                          <XCircle size={13} /> Failed
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted">
                          <MinusCircle size={13} /> Skipped
                        </span>
                      )}
                    </div>
                    {l.error_message && <p className="mt-0.5 text-xs text-danger">{l.error_message}</p>}
                    {l.skipped_reason && <p className="mt-0.5 text-xs text-muted">{l.skipped_reason}</p>}
                    <p className="mt-0.5 text-[11px] text-muted">{l.executed_at ? new Date(l.executed_at).toLocaleString() : ""}</p>
                  </div>
                </li>
              ))}
            </ol>
          )
        )}
      </div>
    </div>
  );
}
