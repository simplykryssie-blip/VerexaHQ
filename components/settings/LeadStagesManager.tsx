"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export type LeadStageRow = {
  id: string;
  key: string;
  label: string;
  display_order: number;
  is_entry_stage: boolean;
};

function slugify(label: string, existingKeys: string[]) {
  let base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_+|_+$)/g, "");
  if (!base) base = "stage";
  let key = base;
  let suffix = 2;
  while (existingKeys.includes(key)) {
    key = `${base}_${suffix}`;
    suffix++;
  }
  return key;
}

export function LeadStagesManager({
  workspaceId,
  stages,
  canEdit,
}: {
  workspaceId: string;
  stages: LeadStageRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const sorted = [...stages].sort((a, b) => a.display_order - b.display_order);

  function startEdit(stage: LeadStageRow) {
    setEditingId(stage.id);
    setEditLabel(stage.label);
  }

  async function saveLabel(stage: LeadStageRow) {
    const label = editLabel.trim();
    if (!label || label === stage.label) {
      setEditingId(null);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("lead_stages").update({ label }).eq("id", stage.id);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function addStage() {
    const label = newLabel.trim();
    if (!label) return;
    setSaving(true);
    const key = slugify(label, sorted.map((s) => s.key));
    const nextOrder = sorted.length > 0 ? Math.max(...sorted.map((s) => s.display_order)) + 1 : 0;
    const { error } = await supabase.from("lead_stages").insert({ workspace_id: workspaceId, key, label, display_order: nextOrder });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setNewLabel("");
    setAdding(false);
    router.refresh();
  }

  async function deleteStage(stage: LeadStageRow) {
    if (!window.confirm(`Delete "${stage.label}"? Any leads currently on this stage would need to move first.`)) return;
    setSaving(true);
    const { error } = await supabase.from("lead_stages").delete().eq("id", stage.id);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function move(stage: LeadStageRow, direction: "up" | "down") {
    const index = sorted.findIndex((s) => s.id === stage.id);
    const neighborIndex = direction === "up" ? index - 1 : index + 1;
    if (neighborIndex < 0 || neighborIndex >= sorted.length) return;
    const neighbor = sorted[neighborIndex];
    setSaving(true);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("lead_stages").update({ display_order: neighbor.display_order }).eq("id", stage.id),
      supabase.from("lead_stages").update({ display_order: stage.display_order }).eq("id", neighbor.id),
    ]);
    setSaving(false);
    if (e1 || e2) {
      toast.show((e1 ?? e2)?.message ?? "Failed to reorder.", "error");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <ul className="divide-y divide-border">
        {sorted.map((stage, index) => (
          <li key={stage.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex flex-col">
              <button
                type="button"
                disabled={!canEdit || saving || index === 0}
                onClick={() => move(stage, "up")}
                className="text-muted hover:text-ink disabled:opacity-30"
                aria-label="Move up"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                disabled={!canEdit || saving || index === sorted.length - 1}
                onClick={() => move(stage, "down")}
                className="text-muted hover:text-ink disabled:opacity-30"
                aria-label="Move down"
              >
                <ArrowDown size={14} />
              </button>
            </div>

            <div className="flex-1">
              {editingId === stage.id ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="rounded-lg border border-border px-2 py-1 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button type="button" onClick={() => saveLabel(stage)} className="text-success" aria-label="Save">
                    <Check size={16} />
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-muted" aria-label="Cancel">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">{stage.label}</span>
                  {stage.is_entry_stage && (
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">Entry stage</span>
                  )}
                </div>
              )}
            </div>

            {canEdit && editingId !== stage.id && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => startEdit(stage)} className="text-muted hover:text-ink" aria-label="Rename">
                  <Pencil size={14} />
                </button>
                {!stage.is_entry_stage && (
                  <button type="button" onClick={() => deleteStage(stage)} className="text-muted hover:text-danger" aria-label="Delete" disabled={saving}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="border-t border-border px-4 py-3">
          {adding ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                placeholder="Stage name"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addStage()}
                className="rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={addStage}
                disabled={!newLabel.trim() || saving}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                Add
              </button>
              <button type="button" onClick={() => { setAdding(false); setNewLabel(""); }} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-surfaceMuted">
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
            >
              <Plus size={14} /> Add a stage
            </button>
          )}
        </div>
      )}
    </div>
  );
}
