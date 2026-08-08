"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";

export default function NewPipelineModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { activeWorkspaceId } = useWorkspace();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [stages, setStages] = useState<string[]>(["New Lead", "In Progress", "Complete"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateStage(idx: number, value: string) {
    setStages((prev) => prev.map((s, i) => (i === idx ? value : s)));
  }

  function addStage() {
    setStages((prev) => [...prev, ""]);
  }

  function removeStage(idx: number) {
    setStages((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (!activeWorkspaceId) {
      setError("Could not determine your workspace.");
      setSaving(false);
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    const { data: pipeline, error: pipelineError } = await supabase
      .from("pipelines")
      .insert({
        workspace_id: activeWorkspaceId,
        pipeline_name: name,
        pipeline_type: type,
        description: "",
        is_active: true,
        created_by: userId,
      })
      .select()
      .single();

    if (pipelineError || !pipeline) {
      setError(pipelineError?.message ?? "Failed to create pipeline.");
      setSaving(false);
      return;
    }

    const stageRows = stages
      .filter((s) => s.trim().length > 0)
      .map((stage_name, idx) => ({
        workspace_id: activeWorkspaceId,
        pipeline_id: pipeline.id,
        stage_name,
        stage_description: "",
        stage_color: ["#64748B", "#B45309", "#0EA5A0", "#0D1B2A", "#B3261E"][idx % 5],
        sort_order: idx,
        is_complete_stage: idx === stages.length - 1,
        is_active: true,
      }));

    const { error: stagesError } = await supabase.from("pipeline_stages").insert(stageRows);

    setSaving(false);
    if (stagesError) {
      setError(stagesError.message);
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-md p-6 max-h-[85vh] overflow-y-auto">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">New Pipeline</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            placeholder="Pipeline name (e.g. Bookkeeping, Tax Prep)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            placeholder="Type (e.g. tax, bookkeeping, payroll, formation)"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />

          <div>
            <div className="text-xs font-semibold text-ink mb-2">Stages, in order</div>
            <div className="space-y-2">
              {stages.map((s, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    required
                    value={s}
                    onChange={(e) => updateStage(idx, e.target.value)}
                    className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeStage(idx)}
                    className="text-muted hover:text-brick"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addStage}
              className="mt-2 flex items-center gap-1 text-xs font-semibold text-ink"
            >
              <Plus size={13} /> Add stage
            </button>
          </div>

          {error && (
            <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm font-semibold py-2 rounded-sm border border-line text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 text-sm font-semibold py-2 rounded-sm bg-ink text-white disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create Pipeline"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
