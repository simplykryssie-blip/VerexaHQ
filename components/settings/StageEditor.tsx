"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Plus, Trash2, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/EmptyState";
import { DeleteStageDialog } from "@/components/settings/DeleteStageDialog";
import { TemplateSelect } from "@/components/settings/TemplateSelect";
import { DocumentRequestTemplatePreview } from "@/components/settings/DocumentRequestTemplatePreview";

type Option = { id: string; name: string };

type ProcessStage = {
  id: string;
  process_id: string;
  name: string;
  display_order: number;
  organizer_template_id?: string | null;
  document_request_template_id?: string | null;
  engagement_letter_template_id?: string | null;
};
type ProcessTask = { id: string; process_stage_id: string; name: string; description: string | null; display_order: number; is_required: boolean };
type ProcessInfo = { id: string; name: string; workspace_id: string | null } | null;

function StageTemplateAttachments({
  stage,
  organizerTemplates,
  documentRequestTemplates,
  engagementLetterTemplates,
}: {
  stage: ProcessStage;
  organizerTemplates: Option[];
  documentRequestTemplates: Option[];
  engagementLetterTemplates: Option[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [organizerId, setOrganizerId] = useState(stage.organizer_template_id ?? "");
  const [documentRequestId, setDocumentRequestId] = useState(stage.document_request_template_id ?? "");
  const [engagementLetterId, setEngagementLetterId] = useState(stage.engagement_letter_template_id ?? "");

  async function update(column: "organizer_template_id" | "document_request_template_id" | "engagement_letter_template_id", value: string) {
    await supabase
      .from("process_stages")
      .update({ [column]: value || null } as Record<typeof column, string | null>)
      .eq("id", stage.id);
    router.refresh();
  }

  const documentRequestName = documentRequestTemplates.find((t) => t.id === documentRequestId)?.name;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">When an engagement reaches this stage</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <TemplateSelect
            value={organizerId}
            onChange={(v) => {
              setOrganizerId(v);
              update("organizer_template_id", v);
            }}
            options={organizerTemplates}
            placeholder="Send organizer..."
          />
          {organizerId && (
            <Link
              href={`/templates/organizers/${organizerId}`}
              target="_blank"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              <Eye size={12} /> Preview
            </Link>
          )}
        </div>
        <div>
          <TemplateSelect
            value={documentRequestId}
            onChange={(v) => {
              setDocumentRequestId(v);
              update("document_request_template_id", v);
            }}
            options={documentRequestTemplates}
            placeholder="Request documents..."
          />
          {documentRequestId && documentRequestName && (
            <div className="mt-1">
              <DocumentRequestTemplatePreview templateId={documentRequestId} templateName={documentRequestName} />
            </div>
          )}
        </div>
        <div>
          <TemplateSelect
            value={engagementLetterId}
            onChange={(v) => {
              setEngagementLetterId(v);
              update("engagement_letter_template_id", v);
            }}
            options={engagementLetterTemplates}
            placeholder="Send for signature..."
          />
          {engagementLetterId && (
            <Link
              href={`/templates/engagement-letters/${engagementLetterId}`}
              target="_blank"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              <Eye size={12} /> Preview
            </Link>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Attaching a template here doesn&apos;t send anything automatically -- it just pre-selects the right one when staff use the manual send
        action on an engagement at this stage.
      </p>
    </div>
  );
}

function StageTasks({ stage, tasks, canEdit }: { stage: ProcessStage; tasks: ProcessTask[]; canEdit: boolean }) {
  const router = useRouter();
  const supabase = createClient();
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
    router.refresh();
  }

  async function deleteTask(taskId: string) {
    if (!window.confirm("Delete this task? This can't be undone.")) return;
    const { error } = await supabase.from("process_tasks").delete().eq("id", taskId);
    if (error) {
      setError(error.message);
      return;
    }
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
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            <Plus size={12} /> Add task
          </button>
        ))}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function StageEditor({
  serviceId,
  isSystemDefault,
  canEdit,
  process,
  stages,
  tasks,
  engagementCountsByStage,
  organizerTemplates,
  documentRequestTemplates,
  engagementLetterTemplates,
}: {
  serviceId: string;
  isSystemDefault: boolean;
  canEdit: boolean;
  process: ProcessInfo;
  stages: ProcessStage[];
  tasks: ProcessTask[];
  engagementCountsByStage: Record<string, number>;
  organizerTemplates: Option[];
  documentRequestTemplates: Option[];
  engagementLetterTemplates: Option[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProcessStage | null>(null);

  const readOnly = isSystemDefault || !canEdit;

  async function addFirstStage() {
    if (!newStageName.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("add_process_stage", { p_service_id: serviceId, p_stage_name: newStageName.trim() });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNewStageName("");
    setAddingStage(false);
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
    router.refresh();
  }

  if (isSystemDefault) {
    return (
      <div>
        <p className="rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm text-muted">
          This is a system default service. Its workflow can&apos;t be edited here -- use &quot;Clone to customize&quot; from Service
          Packages to create your own editable copy.
        </p>
        <StageListReadOnly
          stages={stages}
          tasks={tasks}
          organizerTemplates={organizerTemplates}
          documentRequestTemplates={documentRequestTemplates}
          engagementLetterTemplates={engagementLetterTemplates}
        />
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div>
        <p className="rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm text-muted">
          Only workspace admins can edit this service&apos;s workflow.
        </p>
        <StageListReadOnly
          stages={stages}
          tasks={tasks}
          organizerTemplates={organizerTemplates}
          documentRequestTemplates={documentRequestTemplates}
          engagementLetterTemplates={engagementLetterTemplates}
        />
      </div>
    );
  }

  if (!process || stages.length === 0) {
    return (
      <div>
        <EmptyState message="This service has no workflow yet." />
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
      {stages.map((stage) => {
        const count = engagementCountsByStage[stage.name] ?? 0;
        return (
          <div key={stage.id} className="rounded-xl border border-border bg-surface p-4">
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
                </div>
              )}
              {renamingId !== stage.id && (
                <div className="flex shrink-0 items-center gap-3">
                  <button type="button" onClick={() => startRename(stage)} className="text-muted hover:text-ink" aria-label="Rename stage">
                    <Pencil size={13} />
                  </button>
                  <button type="button" onClick={() => handleDeleteClick(stage)} className="text-muted hover:text-danger" aria-label="Delete stage">
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
            <StageTasks stage={stage} tasks={tasks.filter((t) => t.process_stage_id === stage.id)} canEdit />
            <StageTemplateAttachments
              stage={stage}
              organizerTemplates={organizerTemplates}
              documentRequestTemplates={documentRequestTemplates}
              engagementLetterTemplates={engagementLetterTemplates}
            />
          </div>
        );
      })}

      {addingStage ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-4">
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
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
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
  stages,
  tasks,
  organizerTemplates,
  documentRequestTemplates,
  engagementLetterTemplates,
}: {
  stages: ProcessStage[];
  tasks: ProcessTask[];
  organizerTemplates: Option[];
  documentRequestTemplates: Option[];
  engagementLetterTemplates: Option[];
}) {
  if (stages.length === 0) return null;
  return (
    <div className="mt-4 space-y-3">
      {stages.map((stage) => {
        const organizer = stage.organizer_template_id && organizerTemplates.find((t) => t.id === stage.organizer_template_id);
        const documentRequest = stage.document_request_template_id && documentRequestTemplates.find((t) => t.id === stage.document_request_template_id);
        const engagementLetter = stage.engagement_letter_template_id && engagementLetterTemplates.find((t) => t.id === stage.engagement_letter_template_id);
        const hasAttachments = Boolean(organizer || documentRequest || engagementLetter);
        return (
          <div key={stage.id} className="rounded-xl border border-border bg-surface p-4">
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
            {hasAttachments && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                {organizer && (
                  <span className="flex items-center gap-1">
                    Organizer: {organizer.name}
                    <Link href={`/templates/organizers/${organizer.id}`} target="_blank" className="text-accent hover:underline" aria-label="Preview organizer">
                      <Eye size={12} />
                    </Link>
                  </span>
                )}
                {documentRequest && (
                  <span className="flex items-center gap-1">
                    Documents: {documentRequest.name}
                    <DocumentRequestTemplatePreview templateId={documentRequest.id} templateName={documentRequest.name} />
                  </span>
                )}
                {engagementLetter && (
                  <span className="flex items-center gap-1">
                    Engagement letter: {engagementLetter.name}
                    <Link
                      href={`/templates/engagement-letters/${engagementLetter.id}`}
                      target="_blank"
                      className="text-accent hover:underline"
                      aria-label="Preview engagement letter"
                    >
                      <Eye size={12} />
                    </Link>
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
