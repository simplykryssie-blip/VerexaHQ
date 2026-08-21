"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type StaffRef = { id: string; display_name: string | null } | null;
type StaffOption = { id: string; display_name: string | null };

const ROLES = [
  { key: "default_relationship_manager_id", label: "Relationship manager" },
  { key: "default_reviewer_id", label: "Reviewer" },
  { key: "default_compliance_officer_id", label: "Compliance officer" },
] as const;

// ERO/Service Bureau only (gated by the caller). Presets who a new client
// defaults to instead of always the account holder. Reviewer and Compliance
// officer also flow down as the fallback default for new clients created in
// a connected downline workspace -- see the resolution logic in
// app/(app)/clients/[id]/page.tsx -- since those are oversight roles an
// ERO/SB is presetting network-wide; Relationship manager stays local to
// whichever workspace the client actually belongs to.
export function WorkspaceStaffDefaultsForm({
  workspaceId,
  relationshipManager,
  reviewer,
  complianceOfficer,
  staffOptions,
}: {
  workspaceId: string;
  relationshipManager: StaffRef;
  reviewer: StaffRef;
  complianceOfficer: StaffRef;
  staffOptions: StaffOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const current = {
    default_relationship_manager_id: relationshipManager,
    default_reviewer_id: reviewer,
    default_compliance_officer_id: complianceOfficer,
  };
  const [values, setValues] = useState({
    default_relationship_manager_id: relationshipManager?.id ?? "",
    default_reviewer_id: reviewer?.id ?? "",
    default_compliance_officer_id: complianceOfficer?.id ?? "",
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(field: (typeof ROLES)[number], nextId: string) {
    const previousId = current[field.key]?.id ?? null;
    if (nextId === (previousId ?? "")) return;

    setSaving(field.key);
    setError(null);

    const patch: Record<string, string | null> = { [field.key]: nextId || null };
    const { error: updateError } = await supabase.from("workspaces").update(patch as never).eq("id", workspaceId);
    setSaving(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    toast.show("Default saved", "success");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {ROLES.map((field) => (
        <div key={field.key} className="flex items-center gap-3">
          <label className="w-44 text-sm font-medium text-slate">{field.label}</label>
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
            <option value="">No preset (falls back to the account holder)</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name ?? "Staff"}
              </option>
            ))}
          </select>
        </div>
      ))}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
