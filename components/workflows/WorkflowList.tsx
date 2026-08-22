"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/Toast";
import {
  TriggerFields,
  defaultTriggerConfig,
  triggerSummary,
  type TemplateOption,
  type PipelineOption,
} from "@/components/workflows/TriggerFields";

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

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base || "workflow"}-${Math.random().toString(36).slice(2, 8)}`;
}

export function WorkflowList({
  workspaceId,
  workflows,
  canManage,
  organizerTemplates,
  services = [],
  pipelines = [],
}: {
  workspaceId: string;
  workflows: WorkflowRow[];
  canManage: boolean;
  organizerTemplates: TemplateOption[];
  services?: TemplateOption[];
  pipelines?: PipelineOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("engagement.status_changed");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(defaultTriggerConfig("engagement.status_changed"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        trigger_type: triggerType,
        trigger_config: triggerConfig as never,
      })
      .select("id")
      .single();
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    toast.show("Workflow created", "success");
    router.push(`/workflows/${data.id}`);
  }

  async function toggleEnabled(id: string, current: boolean) {
    const { error } = await supabase.from("automations").update({ is_enabled: !current }).eq("id", id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(current ? "Workflow paused" : "Workflow activated", "success");
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this workflow? Its run history will be removed too. This can't be undone.")) return;
    setDeleteError(null);
    setDeletingId(id);
    const { error: deleteErr } = await supabase.from("automations").delete().eq("id", id);
    setDeletingId(null);
    if (deleteErr) {
      setDeleteError(deleteErr.message);
      return;
    }
    toast.show("Workflow deleted", "success");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen((v) => !v)}>
            <Plus size={14} /> New workflow
          </Button>
        </div>
      )}

      {open && (
        <form onSubmit={create} className="space-y-3 rounded-2xl border border-border bg-surface shadow-soft p-4">
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
          <TriggerFields
            triggerType={triggerType}
            onTriggerTypeChange={setTriggerType}
            config={triggerConfig}
            onConfigChange={setTriggerConfig}
            organizerTemplates={organizerTemplates}
            services={services}
            pipelines={pipelines}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="tertiary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Creating..." : "Create workflow"}
            </Button>
          </div>
        </form>
      )}

      {deleteError && <p className="text-sm text-danger">{deleteError}</p>}

      {workflows.length === 0 ? (
        <EmptyState message="No workflows yet. Create one to automate what happens on an engagement." />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
          {workflows.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <Link href={`/workflows/${w.id}`} className="flex min-w-0 items-center gap-3">
                <Zap size={16} className={w.is_enabled ? "text-accent" : "text-muted"} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium text-ink">{w.name}</p>
                    {w.step_count === 0 && <Badge tone="warning">No steps yet</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted">
                    {triggerSummary(w.trigger_type, w.trigger_config, organizerTemplates, services, pipelines)} &middot; {w.step_count} step
                    {w.step_count === 1 ? "" : "s"} &middot; {w.run_count} run{w.run_count === 1 ? "" : "s"}
                  </p>
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`text-xs font-medium ${w.is_enabled && w.step_count > 0 ? "text-success" : "text-muted"}`}>
                  {w.is_enabled ? (w.step_count === 0 ? "Active, but does nothing" : "Active") : "Paused"}
                </span>
                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleEnabled(w.id, w.is_enabled)}
                      className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-slate hover:bg-surfaceMuted"
                    >
                      {w.is_enabled ? "Pause" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(w.id)}
                      disabled={deletingId === w.id}
                      className="text-muted hover:text-danger disabled:opacity-50"
                      aria-label="Delete workflow"
                    >
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
