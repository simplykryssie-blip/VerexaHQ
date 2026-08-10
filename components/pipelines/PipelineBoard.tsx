"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { slugify, uniqueSlug } from "@/lib/roleSlug";

export type StageOption = { id: string; name: string; display_order: number; color: string | null; is_terminal: boolean };
export type PipelineOption = { id: string; name: string; stages: StageOption[] };
export type BoardEngagement = {
  id: string;
  engagement_number: string | null;
  priority: string | null;
  due_date: string | null;
  pipeline_stage_id: string | null;
  clientLabel: string;
  clientHref: string;
};

const PRIORITY_STYLE: Record<string, string> = {
  Low: "bg-surfaceMuted text-muted",
  Medium: "bg-accentSoft text-accent",
  High: "bg-warning/15 text-warning",
  Urgent: "bg-danger/10 text-danger",
};

export function PipelineBoard({
  workspaceId,
  pipelines,
  selectedPipelineId,
  engagements: initial,
  canManage,
}: {
  workspaceId: string;
  pipelines: PipelineOption[];
  selectedPipelineId: string | null;
  engagements: BoardEngagement[];
  canManage: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [engagements, setEngagements] = useState(initial);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [creatingPipeline, setCreatingPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingStageName, setEditingStageName] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) ?? null;

  async function moveTo(id: string, stageId: string | null) {
    const current = engagements.find((e) => e.id === id);
    if (!current || current.pipeline_stage_id === stageId) return;

    setEngagements((prev) => prev.map((e) => (e.id === id ? { ...e, pipeline_stage_id: stageId } : e)));

    const { error } = await supabase
      .from("engagements")
      .update(stageId ? { pipeline_stage_id: stageId } : { pipeline_stage_id: null, pipeline_id: null })
      .eq("id", id);
    if (error) {
      setEngagements((prev) => prev.map((e) => (e.id === id ? { ...e, pipeline_stage_id: current.pipeline_stage_id } : e)));
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function createPipeline() {
    if (!newPipelineName.trim()) return;
    setSaving(true);
    const existingSlugs = new Set(pipelines.map((p) => slugify(p.name)));
    const slug = uniqueSlug(slugify(newPipelineName), existingSlugs);
    const { data: pipeline, error } = await supabase
      .from("pipelines")
      .insert({ workspace_id: workspaceId, name: newPipelineName.trim(), slug, status: "published" })
      .select("id")
      .single();
    if (error || !pipeline) {
      setSaving(false);
      toast.show(error?.message ?? "Could not create pipeline.", "error");
      return;
    }
    await supabase.from("pipeline_stages").insert([
      { pipeline_id: pipeline.id, name: "New", display_order: 0 },
      { pipeline_id: pipeline.id, name: "Done", display_order: 1, is_terminal: true },
    ]);
    setSaving(false);
    setCreatingPipeline(false);
    setNewPipelineName("");
    router.push(`/pipelines?pipeline=${pipeline.id}`);
    router.refresh();
  }

  async function addStage() {
    if (!selectedPipeline || !newStageName.trim()) return;
    setSaving(true);
    const nextOrder = selectedPipeline.stages.length;
    const { error } = await supabase
      .from("pipeline_stages")
      .insert({ pipeline_id: selectedPipeline.id, name: newStageName.trim(), display_order: nextOrder });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setAddingStage(false);
    setNewStageName("");
    router.refresh();
  }

  async function renameStage(stageId: string) {
    if (!editingStageName.trim()) return;
    const { error } = await supabase.from("pipeline_stages").update({ name: editingStageName.trim() }).eq("id", stageId);
    setEditingStageId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function deleteStage(stageId: string) {
    if (!window.confirm("Delete this stage? Engagements in it will move to Unassigned.")) return;
    const { error } = await supabase.from("pipeline_stages").delete().eq("id", stageId);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  const unassigned = engagements.filter((e) => !e.pipeline_stage_id);

  function Column({ stageId, title, items, terminal }: { stageId: string | null; title: React.ReactNode; items: BoardEngagement[]; terminal?: boolean }) {
    const key = stageId ?? "unassigned";
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverStage(key);
        }}
        onDragLeave={() => setDragOverStage((s) => (s === key ? null : s))}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverStage(null);
          const id = e.dataTransfer.getData("text/plain");
          if (id) moveTo(id, stageId);
        }}
        className={`flex w-72 shrink-0 flex-col rounded-xl border bg-surfaceMuted transition ${
          dragOverStage === key ? "border-accent ring-2 ring-accent/30" : "border-border"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">{title}</div>
          <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted">{items.length}</span>
        </div>
        <div className="flex-1 space-y-2 px-2 pb-2" style={{ minHeight: "60px" }}>
          {items.map((e) => {
            const overdue = Boolean(e.due_date && new Date(e.due_date) < new Date() && !terminal);
            return (
              <div
                key={e.id}
                draggable
                onDragStart={(ev) => {
                  ev.dataTransfer.setData("text/plain", e.id);
                  ev.dataTransfer.effectAllowed = "move";
                  setDraggingId(e.id);
                }}
                onDragEnd={() => setDraggingId(null)}
                className={`cursor-grab rounded-lg border border-border bg-surface p-3 shadow-sm transition active:cursor-grabbing ${
                  draggingId === e.id ? "opacity-40" : ""
                }`}
              >
                <Link href={`/engagements/${e.id}`} className="text-sm font-medium text-accent hover:underline">
                  {e.engagement_number ?? "Engagement"}
                </Link>
                <p className="mt-0.5 truncate text-sm text-slate">
                  <Link href={e.clientHref} className="hover:text-accent hover:underline">
                    {e.clientLabel}
                  </Link>
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  {e.priority && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_STYLE[e.priority] ?? "bg-surfaceMuted text-muted"}`}>
                      {e.priority}
                    </span>
                  )}
                  {e.due_date && (
                    <span className={`text-[11px] ${overdue ? "font-medium text-danger" : "text-muted"}`}>
                      {new Date(e.due_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (pipelines.length === 0) {
    return <p className="text-sm text-muted">Setting up your first pipeline...</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {pipelines.map((p) => (
          <Link
            key={p.id}
            href={`/pipelines?pipeline=${p.id}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              p.id === selectedPipelineId ? "bg-accent text-white" : "bg-surfaceMuted text-muted hover:text-ink"
            }`}
          >
            {p.name}
          </Link>
        ))}
        {canManage && !creatingPipeline && (
          <button
            type="button"
            onClick={() => setCreatingPipeline(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-accent hover:text-accent"
          >
            <Plus size={12} /> New pipeline
          </button>
        )}
      </div>

      {creatingPipeline && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface p-3">
          <input
            autoFocus
            value={newPipelineName}
            onChange={(e) => setNewPipelineName(e.target.value)}
            placeholder="Pipeline name"
            className="flex-1 rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={createPipeline}
            disabled={saving || !newPipelineName.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create"}
          </button>
          <button type="button" onClick={() => setCreatingPipeline(false)} className="text-muted hover:text-ink">
            <X size={16} />
          </button>
        </div>
      )}

      {selectedPipeline && (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3" style={{ minWidth: "max-content" }}>
            <Column stageId={null} title={<h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Unassigned</h3>} items={unassigned} />
            {selectedPipeline.stages.map((stage) => (
              <Column
                key={stage.id}
                stageId={stage.id}
                terminal={stage.is_terminal}
                items={engagements.filter((e) => e.pipeline_stage_id === stage.id)}
                title={
                  editingStageId === stage.id ? (
                    <input
                      autoFocus
                      value={editingStageName}
                      onChange={(e) => setEditingStageName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && renameStage(stage.id)}
                      onBlur={() => renameStage(stage.id)}
                      className="w-full rounded border border-border px-1.5 py-0.5 text-xs"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-muted">{stage.name}</h3>
                      {canManage && (
                        <span className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStageId(stage.id);
                              setEditingStageName(stage.name);
                            }}
                            className="text-muted hover:text-ink"
                            aria-label="Rename stage"
                          >
                            <Pencil size={11} />
                          </button>
                          <button type="button" onClick={() => deleteStage(stage.id)} className="text-muted hover:text-danger" aria-label="Delete stage">
                            <Trash2 size={11} />
                          </button>
                        </span>
                      )}
                    </div>
                  )
                }
              />
            ))}
            {canManage && (
              <div className="flex w-56 shrink-0 flex-col rounded-xl border border-dashed border-border p-3">
                {addingStage ? (
                  <div className="space-y-2">
                    <input
                      autoFocus
                      value={newStageName}
                      onChange={(e) => setNewStageName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addStage()}
                      placeholder="Stage name"
                      className="w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={addStage}
                        disabled={saving || !newStageName.trim()}
                        className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
                      >
                        Add
                      </button>
                      <button type="button" onClick={() => setAddingStage(false)} className="text-xs text-muted hover:text-ink">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingStage(true)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-accent"
                  >
                    <Plus size={14} /> Add a stage
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
