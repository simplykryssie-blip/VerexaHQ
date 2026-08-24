"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { LibraryFolderPane } from "@/components/library/LibraryFolderPane";
import { FolderMoveSelect } from "@/components/library/FolderMoveSelect";
import type { LibraryFolderRow } from "@/components/library/types";

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
  folder_id: string | null;
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
  folders,
  canManage,
}: {
  workspaceId: string;
  pipelines: PipelineCard[];
  folders: LibraryFolderRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      pipelines.filter(
        (p) =>
          (!query || p.name.toLowerCase().includes(query.toLowerCase())) &&
          (status === "all" || p.status === status) &&
          (selectedFolderId === null || p.folder_id === selectedFolderId)
      ),
    [pipelines, query, status, selectedFolderId]
  );

  const folderCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pipelines) {
      if (p.folder_id) map.set(p.folder_id, (map.get(p.folder_id) ?? 0) + 1);
    }
    return map;
  }, [pipelines]);

  async function movePipeline(id: string, folderId: string | null) {
    const { error } = await supabase.from("processes").update({ folder_id: folderId }).eq("id", id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

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

  async function duplicatePipeline(id: string, name: string) {
    setDuplicatingId(id);
    const { data, error } = await supabase.rpc("duplicate_config_object", {
      p_table: "processes",
      p_id: id,
      p_target_workspace_id: workspaceId,
      p_new_name: `${name} (copy)`,
    });
    setDuplicatingId(null);
    if (error || !data) {
      toast.show(error?.message ?? "Could not duplicate the pipeline", "error");
      return;
    }
    toast.show("Pipeline duplicated", "success");
    router.push(`/pipelines/${data}`);
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <LibraryFolderPane
        workspaceId={workspaceId}
        itemType="pipeline"
        canManage={canManage}
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelect={setSelectedFolderId}
        totalCount={pipelines.length}
        counts={folderCounts}
        rootLabel="All Pipelines"
      />
      <div className="min-w-0 flex-1">
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
          {canManage && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="ml-auto rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              + New pipeline
            </button>
          )}
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
                    {canManage && (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => duplicatePipeline(p.id, p.name)}
                          disabled={duplicatingId === p.id}
                          className="text-muted hover:text-ink disabled:opacity-50"
                          aria-label="Duplicate pipeline"
                        >
                          <Copy size={14} />
                        </button>
                        {p.workspace_id && (
                          <button
                            type="button"
                            onClick={() => deletePipeline(p.id, p.name)}
                            disabled={deletingId === p.id}
                            className="text-muted hover:text-danger disabled:opacity-50"
                            aria-label="Delete pipeline"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                    {!canManage && !p.workspace_id && (
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
                  {p.workspace_id && canManage && (
                    <div className="mt-2">
                      <FolderMoveSelect folders={folders} value={p.folder_id} onChange={(folderId) => movePipeline(p.id, folderId)} />
                    </div>
                  )}
                  <Link
                    href={`/pipelines/${p.id}`}
                    className="mt-4 inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-ink"
                  >
                    {p.workspace_id && canManage ? "Edit" : "View"}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {creating && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-8">
            <form onSubmit={createPipeline} className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-softHover">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-ink">New pipeline</h2>
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
    </div>
  );
}
