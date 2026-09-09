"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";

export const SEVERITY_TONE: Record<string, BadgeTone> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "neutral",
};

export const STATUS_TONE: Record<string, BadgeTone> = {
  open: "danger",
  reopened: "danger",
  investigating: "warning",
  retest_required: "warning",
  fixed: "success",
  resolved: "success",
};

const STATUS_OPTIONS = ["open", "investigating", "retest_required", "reopened", "fixed", "resolved"] as const;

export type FindingRow = {
  id: string;
  title: string;
  severity: string;
  status: string;
  affected_module: string | null;
  created_at: string;
  last_detected_at: string;
  decision_notes: string | null;
  ai_agents: { name: string } | null;
  workspaces: { name: string } | null;
};

export function FindingsTable({ findings }: { findings: FindingRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [rows, setRows] = useState(findings);
  const [updating, setUpdating] = useState<string | null>(null);
  const [bulkResolving, setBulkResolving] = useState(false);

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    const { error } = await supabase.rpc("set_agent_finding_status", { p_finding_id: id, p_status: status });
    setUpdating(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    toast.show("Finding updated", "success");
    router.refresh();
  }

  async function resolveAllShown() {
    const openIds = rows.filter((r) => r.status !== "resolved" && r.status !== "fixed").map((r) => r.id);
    if (openIds.length === 0) return;
    if (!window.confirm(`Mark all ${openIds.length} open finding(s) on this page as resolved?`)) return;

    setBulkResolving(true);
    for (const id of openIds) {
      const { error } = await supabase.rpc("set_agent_finding_status", { p_finding_id: id, p_status: "resolved" });
      if (error) {
        toast.show(`Stopped: ${error.message}`, "error");
        setBulkResolving(false);
        router.refresh();
        return;
      }
    }
    setRows((prev) => prev.map((r) => (openIds.includes(r.id) ? { ...r, status: "resolved" } : r)));
    setBulkResolving(false);
    toast.show(`Marked ${openIds.length} finding(s) resolved`, "success");
    router.refresh();
  }

  const openCount = rows.filter((r) => r.status !== "resolved" && r.status !== "fixed").length;

  return (
    <div className="space-y-3">
      {openCount > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={resolveAllShown}
            disabled={bulkResolving}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {bulkResolving ? "Resolving..." : `Mark all ${openCount} shown as resolved`}
          </button>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-3 font-medium">Finding</th>
              <th className="px-5 py-3 font-medium">Agent</th>
              <th className="px-5 py-3 font-medium">Workspace</th>
              <th className="px-5 py-3 font-medium">Module</th>
              <th className="px-5 py-3 font-medium">Severity</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">First seen</th>
              <th className="px-5 py-3 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((f) => (
              <tr key={f.id} className="transition-colors hover:bg-surfaceMuted">
                <td className="px-5 py-3 text-slate">
                  {f.title}
                  {f.decision_notes && <p className="mt-0.5 text-xs text-muted">Note: {f.decision_notes}</p>}
                </td>
                <td className="px-5 py-3 text-slate">{f.ai_agents?.name ?? "--"}</td>
                <td className="px-5 py-3 text-slate">{f.workspaces?.name ?? "--"}</td>
                <td className="px-5 py-3 text-slate">{f.affected_module ?? "--"}</td>
                <td className="px-5 py-3">
                  <Badge tone={SEVERITY_TONE[f.severity] ?? "neutral"} className="capitalize">
                    {f.severity}
                  </Badge>
                </td>
                <td className="px-5 py-3">
                  <select
                    value={f.status}
                    disabled={updating === f.id}
                    onChange={(e) => updateStatus(f.id, e.target.value)}
                    className="rounded-lg border border-border bg-surface px-2 py-1 text-xs capitalize text-ink focus:border-accent focus:outline-none disabled:opacity-60"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s} className="capitalize">
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-5 py-3 text-slate">{new Date(f.created_at).toLocaleDateString()}</td>
                <td className="px-5 py-3 text-slate">{new Date(f.last_detected_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
