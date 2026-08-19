"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { ConditionsEditor, type Condition } from "@/components/workflows/ConditionsEditor";
import type { StaffOption, WorkflowStepEdgeRow } from "@/components/workflows/WorkflowBuilder";
import type { TemplateOption, PipelineOption } from "@/components/workflows/TriggerFields";

// Editor for a condition node's outgoing branches. Branches themselves are
// created by dragging a connection from the condition node to a target on
// the canvas -- this panel only refines an existing connection's label,
// conditions, and evaluation order (edges are tried top to bottom, first
// match wins). A branch with no conditions set is the default/else path.
export function BranchEditor({
  edges,
  targetLabels,
  staffOptions,
  services,
  serviceCategories,
  pipelines,
  canManage,
  onSaved,
}: {
  edges: WorkflowStepEdgeRow[];
  targetLabels: Record<string, string>;
  staffOptions: StaffOption[];
  services: TemplateOption[];
  serviceCategories: TemplateOption[];
  pipelines: PipelineOption[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();

  async function updateLabel(edgeId: string, label: string) {
    const { error } = await supabase.from("automation_step_edges").update({ label: label || null }).eq("id", edgeId);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    onSaved();
  }

  async function updateConditions(edgeId: string, conditions: Condition[]) {
    const { error } = await supabase
      .from("automation_step_edges")
      .update({ branch_conditions: conditions.length === 0 ? null : (conditions as never) })
      .eq("id", edgeId);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    onSaved();
  }

  async function move(edge: WorkflowStepEdgeRow, direction: "up" | "down") {
    const sorted = [...edges].sort((a, b) => a.sort_order - b.sort_order);
    const index = sorted.findIndex((e) => e.id === edge.id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;
    const other = sorted[swapIndex];
    const { error: err1 } = await supabase.from("automation_step_edges").update({ sort_order: other.sort_order }).eq("id", edge.id);
    const { error: err2 } = await supabase.from("automation_step_edges").update({ sort_order: edge.sort_order }).eq("id", other.id);
    if (err1 || err2) {
      toast.show(err1?.message ?? err2?.message ?? "Could not reorder branches", "error");
      return;
    }
    onSaved();
  }

  async function remove(edgeId: string) {
    if (!window.confirm("Remove this branch? The connection will be deleted, but the step it points to will stay on the canvas.")) return;
    const { error } = await supabase.from("automation_step_edges").delete().eq("id", edgeId);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Branch removed", "success");
    onSaved();
  }

  const sorted = [...edges].sort((a, b) => a.sort_order - b.sort_order);

  if (sorted.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-xs text-muted">
        No branches yet. Drag a connection from this node to another step to create one.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Branches are evaluated top to bottom -- the first one whose conditions match wins. Leave a branch&apos;s conditions empty to make
        it the default/else path.
      </p>
      {sorted.map((edge, i) => (
        <div key={edge.id} className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">
              Branch {i + 1} &rarr; {targetLabels[edge.to_step_id] ?? "Untitled step"}
            </span>
            {canManage && (
              <div className="flex items-center gap-1">
                <button type="button" disabled={i === 0} onClick={() => move(edge, "up")} className="rounded p-1 text-muted hover:bg-surfaceMuted disabled:opacity-30" aria-label="Move branch up">
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  disabled={i === sorted.length - 1}
                  onClick={() => move(edge, "down")}
                  className="rounded p-1 text-muted hover:bg-surfaceMuted disabled:opacity-30"
                  aria-label="Move branch down"
                >
                  <ArrowDown size={14} />
                </button>
                <button type="button" onClick={() => remove(edge.id)} className="rounded p-1 text-muted hover:text-danger" aria-label="Remove branch">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
          <input
            disabled={!canManage}
            defaultValue={edge.label ?? ""}
            onBlur={(e) => updateLabel(edge.id, e.target.value)}
            placeholder="Branch label (e.g. Accepted)"
            className="mt-2 w-full rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          />
          <div className="mt-2">
            <ConditionsEditor
              conditions={edge.branch_conditions ?? []}
              onChange={(next) => updateConditions(edge.id, next)}
              staffOptions={staffOptions}
              services={services}
              serviceCategories={serviceCategories}
              pipelines={pipelines}
              disabled={!canManage}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
