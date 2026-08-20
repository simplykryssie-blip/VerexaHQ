"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { ConditionsEditor, type Condition } from "@/components/workflows/ConditionsEditor";
import type { StaffOption, WorkflowStepEdgeRow } from "@/components/workflows/WorkflowBuilder";
import type { TemplateOption, PipelineOption } from "@/components/workflows/TriggerFields";
import { ensureTagConfirmed, collectClientTagValues } from "@/lib/ensureTag";

type DraftBranch = {
  id: string | null;
  clientKey: string;
  label: string;
  conditions: Condition[];
  to_step_id: string | null;
};

function initialBranches(edges: WorkflowStepEdgeRow[]): DraftBranch[] {
  const sorted = [...edges].sort((a, b) => a.sort_order - b.sort_order);
  if (sorted.length === 0) {
    // A brand-new condition step starts pre-filled with the two branches
    // almost every branch actually needs -- Yes gets its condition filled
    // in below, No is left empty so it acts as the else/default path.
    return [
      { id: null, clientKey: "yes", label: "Yes", conditions: [], to_step_id: null },
      { id: null, clientKey: "no", label: "No", conditions: [], to_step_id: null },
    ];
  }
  return sorted.map((e) => ({ id: e.id, clientKey: e.id, label: e.label ?? "", conditions: e.branch_conditions ?? [], to_step_id: e.to_step_id }));
}

// Editing a condition step's branches -- who evaluates in what order, what
// each one checks, and (once dragged on the canvas) where it leads.
// A local draft: nothing hits the database until Save, so adding several
// branches and filling them in doesn't fire a write per keystroke.
export function BranchEditor({
  workspaceId,
  stepId,
  automationId,
  edges,
  targetLabels,
  staffOptions,
  services,
  serviceCategories,
  pipelines,
  canManage,
  onSaved,
  onClose,
  onDeleteStep,
}: {
  workspaceId: string;
  stepId: string;
  automationId: string;
  edges: WorkflowStepEdgeRow[];
  targetLabels: Record<string, string>;
  staffOptions: StaffOption[];
  services: TemplateOption[];
  serviceCategories: TemplateOption[];
  pipelines: PipelineOption[];
  canManage: boolean;
  onSaved: () => void;
  onClose: () => void;
  onDeleteStep: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [branches, setBranches] = useState<DraftBranch[]>(() => initialBranches(edges));
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function addBranch() {
    setBranches((b) => [...b, { id: null, clientKey: `new-${b.length}-${Date.now()}`, label: "", conditions: [], to_step_id: null }]);
  }

  function updateBranch(key: string, patch: Partial<DraftBranch>) {
    setBranches((b) => b.map((br) => (br.clientKey === key ? { ...br, ...patch } : br)));
  }

  function removeBranch(key: string) {
    setBranches((b) => {
      const target = b.find((br) => br.clientKey === key);
      if (target?.id) setRemovedIds((r) => [...r, target.id as string]);
      return b.filter((br) => br.clientKey !== key);
    });
  }

  function move(key: string, direction: "up" | "down") {
    setBranches((b) => {
      const index = b.findIndex((br) => br.clientKey === key);
      const swap = direction === "up" ? index - 1 : index + 1;
      if (swap < 0 || swap >= b.length) return b;
      const next = [...b];
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
  }

  async function save() {
    const tagsToConfirm = collectClientTagValues(branches.flatMap((b) => b.conditions));
    for (const tag of tagsToConfirm) {
      if (!(await ensureTagConfirmed(supabase, workspaceId, tag))) return;
    }

    setSaving(true);
    for (const id of removedIds) {
      const { error } = await supabase.from("automation_step_edges").delete().eq("id", id);
      if (error) {
        toast.show(error.message, "error");
        setSaving(false);
        return;
      }
    }
    for (let i = 0; i < branches.length; i++) {
      const b = branches[i];
      const payload = {
        automation_id: automationId,
        from_step_id: stepId,
        to_step_id: b.to_step_id,
        label: b.label.trim() || null,
        branch_conditions: b.conditions.length === 0 ? null : (b.conditions as never),
        sort_order: i,
      };
      const { error } = b.id
        ? await supabase.from("automation_step_edges").update(payload).eq("id", b.id)
        : await supabase.from("automation_step_edges").insert(payload as never);
      if (error) {
        toast.show(error.message, "error");
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    toast.show("Branches saved", "success");
    onSaved();
    onClose();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Branches are evaluated top to bottom -- the first one whose conditions match wins. Leave a branch&apos;s conditions empty to make
        it the default/else path.
      </p>
      {branches.map((b, i) => (
        <div key={b.clientKey} className="rounded-2xl border border-border bg-surface shadow-soft p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">
              Branch {i + 1}
              {b.to_step_id ? (
                <>
                  {" "}
                  &rarr; {targetLabels[b.to_step_id] ?? "Untitled step"}
                </>
              ) : (
                <span className="text-amber"> -- not connected yet</span>
              )}
            </span>
            {canManage && (
              <div className="flex items-center gap-1">
                <button type="button" disabled={i === 0} onClick={() => move(b.clientKey, "up")} className="rounded p-1 text-muted hover:bg-surfaceMuted disabled:opacity-30" aria-label="Move branch up">
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  disabled={i === branches.length - 1}
                  onClick={() => move(b.clientKey, "down")}
                  className="rounded p-1 text-muted hover:bg-surfaceMuted disabled:opacity-30"
                  aria-label="Move branch down"
                >
                  <ArrowDown size={14} />
                </button>
                <button type="button" onClick={() => removeBranch(b.clientKey)} className="rounded p-1 text-muted hover:text-danger" aria-label="Remove branch">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
          <input
            disabled={!canManage}
            value={b.label}
            onChange={(e) => updateBranch(b.clientKey, { label: e.target.value })}
            placeholder="Branch label (e.g. Accepted)"
            className="mt-2 w-full rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          />
          <div className="mt-2">
            <ConditionsEditor
              conditions={b.conditions}
              onChange={(next) => updateBranch(b.clientKey, { conditions: next })}
              staffOptions={staffOptions}
              services={services}
              serviceCategories={serviceCategories}
              pipelines={pipelines}
              disabled={!canManage}
            />
          </div>
          {!b.to_step_id && (
            <p className="mt-2 text-[11px] text-muted">Drag a connection from this node to another step to wire this branch up.</p>
          )}
        </div>
      ))}

      {canManage && (
        <>
          <button
            type="button"
            onClick={addBranch}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-accent hover:bg-accentSoft"
          >
            <Plus size={14} /> Add branch
          </button>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <button
              type="button"
              onClick={onDeleteStep}
              className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10"
            >
              <Trash2 size={14} /> Delete this condition
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
