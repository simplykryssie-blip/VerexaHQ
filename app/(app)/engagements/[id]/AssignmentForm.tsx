"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { StaffRef, StaffOption } from "./EngagementWorkspaceTabs";

const ROLES = [
  { key: "assigned_staff_id", label: "Assigned staff", defaultKey: "relationship_manager" as const },
  { key: "reviewer_id", label: "Reviewer", defaultKey: "default_reviewer" as const },
  { key: "compliance_officer_id", label: "Compliance officer", defaultKey: "default_compliance_officer" as const },
] as const;

export function AssignmentForm({
  engagementId,
  assignedStaff,
  reviewer,
  complianceOfficer,
  clientDefaults,
  staffOptions,
}: {
  engagementId: string;
  assignedStaff: StaffRef;
  reviewer: StaffRef;
  complianceOfficer: StaffRef;
  clientDefaults: { relationship_manager: StaffRef; default_reviewer: StaffRef; default_compliance_officer: StaffRef };
  staffOptions: StaffOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const current = { assigned_staff_id: assignedStaff, reviewer_id: reviewer, compliance_officer_id: complianceOfficer };
  const [values, setValues] = useState({
    assigned_staff_id: assignedStaff?.id ?? "",
    reviewer_id: reviewer?.id ?? "",
    compliance_officer_id: complianceOfficer?.id ?? "",
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(field: (typeof ROLES)[number], nextId: string) {
    const previousId = current[field.key]?.id ?? null;
    if (nextId === (previousId ?? "")) return;

    setSaving(field.key);
    setError(null);

    const patch: Record<string, string | null> = { [field.key]: nextId || null };
    const { error: updateError } = await supabase
      .from("engagements")
      .update(patch as never)
      .eq("id", engagementId);
    setSaving(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {ROLES.map((field) => {
        const defaultStaff = clientDefaults[field.defaultKey];
        const differs = Boolean(defaultStaff?.id) && values[field.key] !== defaultStaff?.id;
        return (
          <div key={field.key} className="flex items-center gap-3">
            <label className="w-40 text-sm font-medium text-slate">{field.label}</label>
            <select
              value={values[field.key]}
              onChange={(e) => {
                const next = e.target.value;
                setValues((v) => ({ ...v, [field.key]: next }));
                save(field, next);
              }}
              disabled={saving === field.key}
              className="rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">Unassigned</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name ?? "Staff"}
                </option>
              ))}
            </select>
            {differs && <span className="text-xs text-warning">(≠ client default)</span>}
          </div>
        );
      })}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
