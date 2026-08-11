"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ENGAGEMENT_STATUS_OPTIONS } from "@/lib/engagementStatus";
import { EmptyState } from "@/components/EmptyState";

export type WorkflowRow = {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  is_enabled: boolean;
  status: string;
  step_count: number;
  run_count: number;
};

function triggerLabel(row: Pick<WorkflowRow, "trigger_type" | "trigger_config">) {
  if (row.trigger_type === "engagement.status_changed") {
    return `When engagement status changes to "${row.trigger_config.to_status ?? "?"}"`;
  }
  return row.trigger_type;
}

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base || "workflow"}-${Math.random().toString(36).slice(2, 8)}`;
}

export function WorkflowList({ workspaceId, workflows, canManage }: { workspaceId: string; workflows: WorkflowRow[]; canManage: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [toStatus, setToStatus] = useState(ENGAGEMENT_STATUS_OPTIONS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Give this workflow a name.");
      return;
    }
    setSaving(true);
    const { data, error: insertError } = await supabase
      .from("automations")
      .insert({
        workspace_id: workspaceId,
        name: name.trim(),
        slug: slugify(name),
        trigger_type: "engagement.status_changed",
        trigger_config: { to_status: toStatus },
      })
      .select("id")
      .single();
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    router.push(`/workflows/${data.id}`);
  }

  async function toggleEnabled(id: string, current: boolean) {
    await supabase.from("automations").update({ is_enabled: !current }).eq("id", id);
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this workflow? Its run history will be removed too. This can't be undone.")) return;
    await supabase.from("automations").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent/90"
          >
            <Plus size={14} /> New workflow
          </button>
        </div>
      )}

      {open && (
        <form onSubmit={create} className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Notify client when review is done"
                className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              When engagement status changes to
              <select
                value={toStatus}
                onChange={(e) => setToStatus(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {ENGAGEMENT_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate hover:bg-surfaceMuted">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60">
              {saving ? "Creating..." : "Create workflow"}
            </button>
          </div>
        </form>
      )}

      {workflows.length === 0 ? (
        <EmptyState message="No workflows yet. Create one to automate what happens on an engagement status change." />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {workflows.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <Link href={`/workflows/${w.id}`} className="flex min-w-0 items-center gap-3">
                <Zap size={16} className={w.is_enabled ? "text-accent" : "text-muted"} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{w.name}</p>
                  <p className="truncate text-xs text-muted">
                    {triggerLabel(w)} &middot; {w.step_count} step{w.step_count === 1 ? "" : "s"} &middot; {w.run_count} run{w.run_count === 1 ? "" : "s"}
                  </p>
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`text-xs font-medium ${w.is_enabled ? "text-success" : "text-muted"}`}>{w.is_enabled ? "Active" : "Paused"}</span>
                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleEnabled(w.id, w.is_enabled)}
                      className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-slate hover:bg-surfaceMuted"
                    >
                      {w.is_enabled ? "Pause" : "Activate"}
                    </button>
                    <button type="button" onClick={() => remove(w.id)} className="text-muted hover:text-danger" aria-label="Delete workflow">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
