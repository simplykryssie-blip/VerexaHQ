"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import DateField from "@/components/DateField";
import { friendlyError } from "@/lib/friendlyError";
import { listActiveStaff, type StaffOption } from "@/lib/workspaceMembers";

const PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
type Priority = (typeof PRIORITIES)[number];

type EngagementRow = {
  id: string;
  workspace_id: string;
  workflow_id: string | null;
  current_stage: string | null;
  priority: Priority | null;
  due_date: string | null;
  internal_reference: string | null;
  assigned_staff_id: string | null;
};

type ProcessStage = { id: string; name: string; display_order: number };

// The live equivalent of NewServiceModal's old "edit" mode, which updated a
// per-client `services` row that doesn't exist on the live schema. A
// client's service is now an `engagements` row (client_id, service_id,
// workflow_id, current_stage, priority, due_date, etc.) -- this edits that
// row directly. engagements_update RLS requires engagements.manage or
// engagements.assign, the same permission a user editing a service was
// already expected to have.
export default function EditEngagementModal({
  engagementId,
  onClose,
  onSaved,
}: {
  engagementId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [engagement, setEngagement] = useState<EngagementRow | null>(null);
  const [stages, setStages] = useState<ProcessStage[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);

  const [stageName, setStageName] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [dueDate, setDueDate] = useState("");
  const [internalReference, setInternalReference] = useState("");
  const [assignedTo, setAssignedTo] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("engagements")
      .select("id, workspace_id, workflow_id, current_stage, priority, due_date, internal_reference, assigned_staff_id")
      .eq("id", engagementId)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (loadError || !data) {
          setError(friendlyError(loadError, "Couldn't load this engagement."));
          setLoading(false);
          return;
        }
        const e = data as EngagementRow;
        setEngagement(e);
        setStageName(e.current_stage ?? "");
        setPriority(e.priority ?? "Medium");
        setDueDate(e.due_date ? e.due_date.slice(0, 10) : "");
        setInternalReference(e.internal_reference ?? "");
        setAssignedTo(e.assigned_staff_id ?? "");

        listActiveStaff(e.workspace_id).then(setStaff);
        if (e.workflow_id) {
          supabase
            .from("process_stages")
            .select("id, name, display_order")
            .eq("process_id", e.workflow_id)
            .order("display_order")
            .then(({ data: stageData }) => setStages((stageData as ProcessStage[]) ?? []));
        }
        setLoading(false);
      });
  }, [engagementId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("engagements")
      .update({
        current_stage: stageName || null,
        priority,
        due_date: dueDate || null,
        internal_reference: internalReference || null,
        assigned_staff_id: assignedTo || null,
      })
      .eq("id", engagementId);

    setSaving(false);
    if (updateError) {
      setError(friendlyError(updateError, "Something went wrong. Please try again."));
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4 py-8">
      <div className="bg-white rounded-sm border border-line w-full max-w-md max-h-full overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-slab text-lg font-bold text-ink">Edit Engagement</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {loading && <p className="text-sm text-muted">Loading…</p>}

        {!loading && !engagement && (
          <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
            {error ?? "This engagement could not be found."}
          </div>
        )}

        {!loading && engagement && (
          <form onSubmit={handleSubmit} className="space-y-3">
            {stages.length > 0 && (
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted">Stage</label>
                <select value={stageName} onChange={(e) => setStageName(e.target.value)} className="w-full border border-line rounded-sm px-3 py-2 text-sm">
                  {stages.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted">Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="w-full border border-line rounded-sm px-3 py-2 text-sm">
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted">Due date</label>
                <DateField value={dueDate} onChange={setDueDate} className="w-full border border-line rounded-sm px-3 py-2 text-sm" />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-muted">Internal reference</label>
              <input
                value={internalReference}
                onChange={(e) => setInternalReference(e.target.value)}
                placeholder="Staff-only reference, not shown to the client"
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-muted">Assigned to</label>
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-full border border-line rounded-sm px-3 py-2 text-sm">
                <option value="">Unassigned</option>
                {staff.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {error && <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">{error}</div>}

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="flex-1 text-sm font-semibold py-2 rounded-sm border border-line text-ink">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="flex-1 text-sm font-semibold py-2 rounded-sm bg-ink text-white disabled:opacity-60">
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
