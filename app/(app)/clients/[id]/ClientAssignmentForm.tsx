"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import type { StaffOption } from "./ClientWorkspaceTabs";

type StaffRef = { id: string; display_name: string | null } | null;

const ROLES = [
  { key: "relationship_manager_id", label: "Relationship manager" },
  { key: "default_reviewer_id", label: "Reviewer" },
  { key: "default_compliance_officer_id", label: "Compliance officer" },
] as const;

export function ClientAssignmentForm({
  clientId,
  relationshipManager,
  defaultReviewer,
  defaultComplianceOfficer,
  rmDefault,
  reviewerDefault,
  complianceDefault,
  staffOptions,
}: {
  clientId: string;
  relationshipManager: StaffRef;
  defaultReviewer: StaffRef;
  defaultComplianceOfficer: StaffRef;
  /** Falls back to the workspace's own Firm Profile preset, then the parent
   *  firm's preset for Reviewer/Compliance officer, then the account
   *  holder -- see the resolution in app/(app)/clients/[id]/page.tsx. */
  rmDefault: StaffRef;
  reviewerDefault: StaffRef;
  complianceDefault: StaffRef;
  staffOptions: StaffOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const current = {
    relationship_manager_id: relationshipManager,
    default_reviewer_id: defaultReviewer,
    default_compliance_officer_id: defaultComplianceOfficer,
  };
  const defaults = {
    relationship_manager_id: rmDefault,
    default_reviewer_id: reviewerDefault,
    default_compliance_officer_id: complianceDefault,
  };
  const [values, setValues] = useState({
    relationship_manager_id: relationshipManager?.id ?? rmDefault?.id ?? "",
    default_reviewer_id: defaultReviewer?.id ?? reviewerDefault?.id ?? "",
    default_compliance_officer_id: defaultComplianceOfficer?.id ?? complianceDefault?.id ?? "",
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A default can point at someone outside this workspace's own staff list
  // (an ERO/SB's preset Reviewer/Compliance officer, for a connected
  // downline's client) -- make sure that person still shows up as a
  // selectable, correctly-labeled option instead of the picker silently
  // falling back to "Unassigned" for a value it doesn't recognize.
  function optionsFor(field: (typeof ROLES)[number]) {
    const defaultPerson = defaults[field.key];
    if (!defaultPerson || staffOptions.some((s) => s.id === defaultPerson.id)) return staffOptions;
    return [...staffOptions, defaultPerson];
  }

  async function save(field: (typeof ROLES)[number], nextId: string) {
    const previousId = current[field.key]?.id ?? null;
    if (nextId === (previousId ?? "")) return;

    setSaving(field.key);
    setError(null);

    const patch: Record<string, string | null> = { [field.key]: nextId || null };
    const { error: updateError } = await supabase.from("clients").update(patch as never).eq("id", clientId);
    setSaving(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    toast.show("Assignment saved", "success");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {ROLES.map((field) => {
        const defaultPerson = defaults[field.key];
        const isDefaulted = !current[field.key]?.id && Boolean(defaultPerson?.id);
        return (
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
              <option value="">Unassigned</option>
              {optionsFor(field).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name ?? "Staff"}
                </option>
              ))}
            </select>
            {isDefaulted && <span className="text-xs text-muted">(defaulted to {defaultPerson?.display_name ?? "preset"})</span>}
          </div>
        );
      })}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
