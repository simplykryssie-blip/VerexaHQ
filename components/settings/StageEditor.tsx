"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/EmptyState";
import { DeleteStageDialog } from "@/components/settings/DeleteStageDialog";
import { useToast } from "@/components/Toast";

type ProcessStage = {
  id: string;
  process_id: string;
  name: string;
  display_order: number;
};
type ProcessTask = { id: string; process_stage_id: string; name: string; description: string | null; display_order: number; is_required: boolean };
type ProcessInfo = { id: string; name: string; workspace_id: string | null } | null;

function StageTasks({ stage, tasks, canEdit }: { stage: ProcessStage; tasks: ProcessTask[]; canEdit: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editRequired, setEditRequired] = useState(false);

  async function addTask() {
    if (!newTaskName.trim()) return;
    const nextOrder = tasks.length > 0 ? Math.max(...tasks.map((t) => t.display_order)) + 1 : 0;
    const { error } = await supabase.from("process_tasks").insert({
      process_stage_id: stage.id,
      name: newTaskName.trim(),
      display_order: nextOrder,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setNewTaskName("");
    setAdding(false);
    toast.show("Task added", "success");
    router.refresh();
  }

  function startEdit(task: ProcessTask) {
    setEditingId(task.id);
    setEditName(task.name);
    setEditDescription(task.description ?? "");
    setEditRequired(task.is_required);
  }

  async function saveEdit(taskId: string) {
    const { error } = await supabase
      .from("process_tasks")
      .update({ name: editName, description: editDescription || null, is_required: editRequired })
      .eq("id", taskId);
    if (error) {
      setError(error.message);
      return;
    }
    setEditingId(null);
    toast.show("Task saved", "success");
    router.refresh();
  }

  async function deleteTask(taskId: string) {
    if (!window.confirm("Delete this task? This can't be undone.")) return;
    const { error } = await supabase.from("process_tasks").delete().eq("id", taskId);
    if (error) {
      setError(error.message);
      return;
    }
    toast.show("Task deleted", "success");
    router.refresh();
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {tasks.length === 0 && !adding && <p className="text-xs text-muted">No tasks in this stage yet.</p>}
      {tasks.map((t) =>
        editingId === t.id ? (
          <div key={t.id} className="space-y-2 rounded-lg border border-border bg-surfaceMuted p-2">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <label className="flex items-center gap-2 text-xs text-slate">
              <input type="checkbox" checked={editRequired} onChange={(e) => setEditRequired(e.target.checked)} className="h-3.5 w-3.5 rounded border-border" />
              Required
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingId(null)} className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate hover:bg-surface">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveEdit(t.id)}
                className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent/90"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div key={t.id} className="flex items-start justify-between gap-2 text-sm">
            <div>
              <span className="text-ink">{t.name}</span>
              {t.is_required && <span className="ml-1.5 text-[10px] font-semibold uppercase text-warning">Required</span>}
              {t.description && <p className="text-xs text-muted">{t.description}</p>}
            </div>
            {canEdit && (
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => startEdit(t)} className="text-muted hover:text-ink" aria-label="Edit task">
                  <Pencil size={12} />
                </button>
                <button type="button" onClick={() => deleteTask(t.id)} className="text-muted hover:text-danger" aria-label="Delete task">
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>
        )
      )}

      {canEdit &&
        (adding ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              placeholder="Task name"
              className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button type="button" onClick={addTask} className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-white hover:bg-accent/90">
              Add
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-xs text-muted hover:text-ink">
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-accent hover:bg-accentSoft"
          >
            <Plus size={12} /> Add task
          </button>
        ))}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

type LeadCard = { clientId: string; name: string };

function StageLeads({
  processId,
  stageId,
  leads,
  allStages,
}: {
  processId: string;
  stageId: string;
  leads: LeadCard[];
  allStages: ProcessStage[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [savingId, setSavingId] = useState<string | null>(null);

  if (leads.length === 0) return null;

  async function move(clientId: string, newStageId: string) {
    if (newStageId === stageId) return;
    setSavingId(clientId);
    const { error } = await supabase.rpc("advance_lead_pipeline_stage", {
      p_client_id: clientId,
      p_process_id: processId,
      p_process_stage_id: newStageId,
    });
    setSavingId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Stage updated", "success");
    router.refresh();
  }

  return (
    <div className="mt-3 space-y-1.5 border-t border-border pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Leads on this stage</p>
      {leads.map((lead) => (
        <div key={lead.clientId} className="flex items-center justify-between gap-2 text-sm">
          <Link href={`/clients/${lead.clientId}`} className="text-accent hover:underline">
            {lead.name}
          </Link>
          <select
            value={stageId}
            onChange={(e) => move(lead.clientId, e.target.value)}
            disabled={savingId === lead.clientId}
            className="rounded-lg border border-border px-2 py-1 text-xs text-slate focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          >
            {allStages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

export function StageEditor({
  source,
  isSystemDefault,
  canEdit,
  process,
  stages,
  tasks,
  engagementCountsByStage,
  isLeadPipeline = false,
  leadsByStage = {},
}: {
  /** A stage editor either bootstraps its process from a Service (the
   *  original flow) or operates on an already-standalone Pipeline created
   *  directly under /pipelines -- the two "add first/next stage" RPCs
   *  differ, everything else (rename/delete/attach) is process-native
   *  either way and doesn't care which mode created the process. */
  source: { kind: "service"; serviceId: string } | { kind: "pipeline"; processId: string };
  isSystemDefault: boolean;
  canEdit: boolean;
  process: ProcessInfo;
  stages: ProcessStage[];
  tasks: ProcessTask[];
  engagementCountsByStage: Record<string, number>;
  /** When this pipeline is the workspace's default for new leads, every
   *  stage card also shows the leads currently sitting on it, with a way to
   *  move them -- same card shape as every other pipeline, just an extra
   *  section alongside Tasks, instead of a separate page layout. */
  isLeadPipeline?: boolean;
  leadsByStage?: Record<string, LeadCard[]>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProcessStage | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  async function moveStage(stageId: string, direction: "up" | "down") {
    setMovingId(stageId);
    setError(null);
    const { error } = await supabase.rpc("reorder_process_stage", { p_stage_id: stageId, p_direction: direction });
    setMovingId(null);
    if (error) {
      setError(error.message);
      return;
    }
    toast.show("Stage order saved", "success");
    router.refresh();
  }

  const readOnly = isSystemDefault || !canEdit;
  const noun = source.kind === "service" ? "service" : "pipeline";

  async function addFirstStage() {
    if (!newStageName.trim()) return;
    setBusy(true);
    setError(null);
    const { error } =
      source.kind === "service"
        ? await supabase.rpc("add_process_stage", { p_service_id: source.serviceId, p_stage_name: newStageName.trim() })
        : await supabase.rpc("add_process_stage_to_pipeline", { p_process_id: source.processId, p_stage_name: newStageName.trim() });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNewStageName("");
    setAddingStage(false);
    toast.show("Stage added", "success");
    router.refresh();
  }

  function startRename(stage: ProcessStage) {
    setRenamingId(stage.id);
    setRenameValue(stage.name);
  }

  async function saveRename(stage: ProcessStage) {
    if (!renameValue.trim() || renameValue === stage.name) {
      setRenamingId(null);
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("rename_process_stage", { p_stage_id: stage.id, p_new_name: renameValue.trim() });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setRenamingId(null);
    toast.show("Stage renamed", "success");
    router.refresh();
  }

  async function handleDeleteClick(stage: ProcessStage) {
    const count = engagementCountsByStage[stage.name] ?? 0;
    if (count > 0) {
      setDeleteTarget(stage);
      return;
    }
    if (!window.confirm(`Delete stage "${stage.name}"? This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("delete_process_stage", { p_stage_id: stage.id });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    toast.show("Stage deleted", "success");
    router.refresh();
  }

  async function confirmDeleteWithDestination(destination: { stageId: string } | { newStageName: string }) {
    if (!deleteTarget) return;
    setError(null);
    const { error } = await supabase.rpc("delete_process_stage", {
      p_stage_id: deleteTarget.id,
      p_destination_stage_id: "stageId" in destination ? destination.stageId : undefined,
      p_new_stage_name: "newStageName" in destination ? destination.newStageName : undefined,
    });
    if (error) {
      setError(error.message);
      setDeleteTarget(null);
      return;
    }
    setDeleteTarget(null);
    toast.show("Stage deleted", "success");
    router.refresh();
  }

  if (isSystemDefault) {
    return (
      <div>
        <p className="rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm text-muted">
          This is a system default {noun}. Its workflow can&apos;t be edited here -- clone it to create your own editable copy.
        </p>
        <StageListReadOnly
          processId={process?.id}
          stages={stages}
          tasks={tasks}
          isLeadPipeline={isLeadPipeline}
          leadsByStage={leadsByStage}
        />
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div>
        <p className="rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm text-muted">
          Only workspace admins can edit this {noun}&apos;s workflow.
        </p>
        <StageListReadOnly
          processId={process?.id}
          stages={stages}
          tasks={tasks}
          isLeadPipeline={isLeadPipeline}
          leadsByStage={leadsByStage}
        />
      </div>
    );
  }

  if (!process || stages.length === 0) {
    return (
      <div>
        <EmptyState message={source.kind === "service" ? "This service has no workflow yet." : "This pipeline has no stages yet."} />
        <div className="mt-3">
          {addingStage ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addFirstStage()}
                placeholder="First stage name (e.g. Intake & Organizer)"
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={addFirstStage}
                disabled={busy}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {busy ? "Adding..." : "Add"}
              </button>
              <button type="button" onClick={() => setAddingStage(false)} className="text-sm text-muted hover:text-ink">
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingStage(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              <Plus size={14} /> Add first stage
            </button>
          )}
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stages.map((stage, index) => {
        const count = engagementCountsByStage[stage.name] ?? 0;
        const leads = leadsByStage[stage.id] ?? [];
        return (
          <div key={stage.id} className="rounded-2xl border border-border bg-surface shadow-soft p-4">
            <div className="flex items-center justify-between gap-2">
              {renamingId === stage.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveRename(stage)}
                    className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button type="button" onClick={() => saveRename(stage)} disabled={busy} className="text-xs font-medium text-accent hover:underline">
                    Save
                  </button>
                  <button type="button" onClick={() => setRenamingId(null)} className="text-xs text-muted hover:text-ink">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-ink">{stage.name}</h4>
                  {count > 0 && (
                    <span className="rounded-full bg-accentSoft px-2 py-0.5 text-[11px] font-medium text-accent">
                      {count} engagement{count === 1 ? "" : "s"}
                    </span>
                  )}
                  {isLeadPipeline && leads.length > 0 && (
                    <span className="rounded-full bg-accentSoft px-2 py-0.5 text-[11px] font-medium text-accent">
                      {leads.length} lead{leads.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              )}
              {renamingId !== stage.id && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveStage(stage.id, "up")}
                    disabled={index === 0 || movingId !== null}
                    className="rounded p-1 text-muted hover:bg-surfaceMuted hover:text-ink disabled:opacity-30"
                    aria-label="Move stage up"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStage(stage.id, "down")}
                    disabled={index === stages.length - 1 || movingId !== null}
                    className="rounded p-1 text-muted hover:bg-surfaceMuted hover:text-ink disabled:opacity-30"
                    aria-label="Move stage down"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button type="button" onClick={() => startRename(stage)} className="ml-2 text-muted hover:text-ink" aria-label="Rename stage">
                    <Pencil size={13} />
                  </button>
                  <button type="button" onClick={() => handleDeleteClick(stage)} className="text-muted hover:text-danger" aria-label="Delete stage">
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
            <StageTasks stage={stage} tasks={tasks.filter((t) => t.process_stage_id === stage.id)} canEdit />
            {isLeadPipeline && process && <StageLeads processId={process.id} stageId={stage.id} leads={leads} allStages={stages} />}
          </div>
        );
      })}

      {addingStage ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface shadow-soft p-4">
          <input
            autoFocus
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFirstStage()}
            placeholder="New stage name"
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={addFirstStage}
            disabled={busy}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {busy ? "Adding..." : "Add"}
          </button>
          <button type="button" onClick={() => setAddingStage(false)} className="text-sm text-muted hover:text-ink">
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingStage(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-accent hover:bg-accentSoft"
        >
          <Plus size={14} /> Add stage
        </button>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {deleteTarget && (
        <DeleteStageDialog
          stageName={deleteTarget.name}
          affectedCount={engagementCountsByStage[deleteTarget.name] ?? 0}
          otherStages={stages.filter((s) => s.id !== deleteTarget.id).map((s) => ({ id: s.id, name: s.name }))}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteWithDestination}
        />
      )}
    </div>
  );
}

function StageListReadOnly({
  processId,
  stages,
  tasks,
  isLeadPipeline = false,
  leadsByStage = {},
}: {
  processId?: string;
  stages: ProcessStage[];
  tasks: ProcessTask[];
  isLeadPipeline?: boolean;
  leadsByStage?: Record<string, LeadCard[]>;
}) {
  if (stages.length === 0) return null;
  return (
    <div className="mt-4 space-y-3">
      {stages.map((stage) => (
        <div key={stage.id} className="rounded-2xl border border-border bg-surface shadow-soft p-4">
          <h4 className="text-sm font-semibold text-ink">{stage.name}</h4>
          <ul className="mt-2 space-y-1">
            {tasks
              .filter((t) => t.process_stage_id === stage.id)
              .map((t) => (
                <li key={t.id} className="text-sm text-slate">
                  {t.name}
                  {t.is_required && <span className="ml-1.5 text-[10px] font-semibold uppercase text-warning">Required</span>}
                </li>
              ))}
          </ul>
          {isLeadPipeline && processId && (
            <StageLeads processId={processId} stageId={stage.id} leads={leadsByStage[stage.id] ?? []} allStages={stages} />
          )}
        </div>
      ))}
    </div>
  );
}
