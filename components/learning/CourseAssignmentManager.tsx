"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { SettingsCard } from "@/components/settings/SettingsCard";

export type StaffOption = { id: string; displayName: string };
export type CourseAssignment = { userId: string; dueDate: string | null };

export function CourseAssignmentManager({
  courseId,
  staffOptions,
  initialAssignments,
}: {
  courseId: string;
  staffOptions: StaffOption[];
  initialAssignments: CourseAssignment[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [assignments, setAssignments] = useState(initialAssignments);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const assignedIds = new Set(assignments.map((a) => a.userId));
  const availableStaff = staffOptions.filter((s) => !assignedIds.has(s.id));
  const nameById = new Map(staffOptions.map((s) => [s.id, s.displayName]));

  async function assign() {
    if (!selectedStaffId) return;
    setSaving(true);
    const { error } = await supabase.rpc("assign_learning_course", {
      p_course_id: courseId,
      p_user_id: selectedStaffId,
      p_due_date: dueDate || undefined,
    });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setAssignments((prev) => [...prev, { userId: selectedStaffId, dueDate: dueDate || null }]);
    setSelectedStaffId("");
    setDueDate("");
    toast.show("Assigned", "success");
    router.refresh();
  }

  async function unassign(userId: string) {
    const { error } = await supabase.rpc("unassign_learning_course", { p_course_id: courseId, p_user_id: userId });
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setAssignments((prev) => prev.filter((a) => a.userId !== userId));
    router.refresh();
  }

  return (
    <SettingsCard title="Assign to staff" description="Push this course to specific people, with an optional due date -- they'll see it in a dedicated section on their Learning Hub.">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Staff member
          <select
            value={selectedStaffId}
            onChange={(e) => setSelectedStaffId(e.target.value)}
            className="min-w-[10rem] rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Choose someone...</option>
            {availableStaff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Due date (optional)
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <button
          type="button"
          onClick={assign}
          disabled={!selectedStaffId || saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          <UserPlus size={14} aria-hidden="true" /> Assign
        </button>
      </div>

      {assignments.length > 0 && (
        <ul className="mt-4 divide-y divide-border rounded-2xl border border-border">
          {assignments.map((a) => (
            <li key={a.userId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="text-ink">{nameById.get(a.userId) ?? "Unknown"}</span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {a.dueDate ? `Due ${new Date(a.dueDate).toLocaleDateString()}` : "No due date"}
                <button type="button" onClick={() => unassign(a.userId)} aria-label={`Unassign ${nameById.get(a.userId) ?? "staff member"}`} className="text-muted hover:text-danger">
                  <X size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
