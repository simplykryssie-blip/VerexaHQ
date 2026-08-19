"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const PIPELINE_STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  published: "success",
  archived: "neutral",
};

export type PipelineCard = {
  id: string;
  name: string;
  status: string;
  workspace_id: string | null;
  stage_count: number;
};

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export function PipelineLibrary({
  workspaceId,
  pipelines,
  defaultLeadProcessId,
}: {
  workspaceId: string;
  pipelines: PipelineCard[];
  defaultLeadProcessId?: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [defaultLeadId, setDefaultLeadId] = useState(defaultLeadProcessId ?? null);

  async function setDefaultForLeads(id: string) {
    const next = defaultLeadId === id ? null : id;
    setDefaultLeadId(next);
    const { error } = await supabase.from("workspaces").update({ default_lead_process_id: next }).eq("id", workspaceId);
    if (error) {
      toast.show(error.message, "error");
      setDefaultLeadId(defaultLeadId);
      return;
    }
    toast.show(next ? "Set as the pipeline for new leads" : "Cleared default lead pipeline", "success");
    router.refresh();
  }

  const filtered = useMemo(
    () => pipelines.filter((p) => (!query || p.name.toLowerCase().includes(query.toLowerCase())) && (status === "all" || p.status === status)),
    [pipelines, query, status]
  );

  async function createPipeline(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { data, error } = await supabase.rpc("create_workflow_pipeline", { p_workspace_id: workspaceId, p_name: name.trim() });
    setSaving(false);
    if (error || !data) {
      setError(error?.message ?? "Could not create pipeline.");
      return;
    }
    router.push(`/pipelines/${data}`);
  }

  async function deletePipeline(id: string, name: string) {
    if (!window.confirm(`Delete the "${name}" pipeline? This can't be undone.`)) return;
    setDeleteError(null);
    setDeletingId(id);
    const { error } = await supabase.rpc("delete_workflow_pipeline", { p_process_id: id });
    setDeletingId(null);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    toast.show("Pipeline deleted", "success");
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pipelines..."
          className="w-64 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="ml-auto rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          + New pipeline
        </button>
      </div>

      {deleteError && <p className="mt-2 text-sm text-danger">{deleteError}</p>}

      <div className="mt-4">
        {filtered.length === 0 ? (
          <EmptyState message="No pipelines match." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <div key={p.id} className="flex flex-col rounded-2xl border border-border bg-surface shadow-soft p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">{p.name}</h3>
                  {p.workspace_id ? (
                    <button
                      type="button"
                      onClick={() => deletePipeline(p.id, p.name)}
                      disabled={deletingId === p.id}
                      className="shrink-0 text-muted hover:text-danger disabled:opacity-50"
                      aria-label="Delete pipeline"
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : (
                    <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">System</span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {p.workspace_id ? (
                    <TemplateStatusCycle table="processes" id={p.id} status={p.status} />
                  ) : (
                    <Badge tone={PIPELINE_STATUS_TONE[p.status] ?? "neutral"} className="capitalize">
                      {p.status}
                    </Badge>
                  )}
                  <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">
                    {p.stage_count} stage{p.stage_count === 1 ? "" : "s"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDefaultForLeads(p.id)}
                  className={`mt-2 inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                    defaultLeadId === p.id ? "bg-accentSoft text-accent" : "text-muted hover:text-ink"
                  }`}
                >
                  <Star size={11} fill={defaultLeadId === p.id ? "currentColor" : "none"} />
                  {defaultLeadId === p.id ? "Default for new leads" : "Set as default for new leads"}
                </button>
                <Link
                  href={`/pipelines/${p.id}`}
                  className="mt-4 inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-ink"
                >
                  {p.workspace_id ? "Edit" : "View"}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-8">
          <form onSubmit={createPipeline} className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-soft p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">New pipeline</h2>
              <button type="button" onClick={() => setCreating(false)} className="text-lg text-muted hover:text-ink">
                &times;
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (e.g. Full Service 1040)"
                required
                autoFocus
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {saving ? "Creating..." : "Create & open editor"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
