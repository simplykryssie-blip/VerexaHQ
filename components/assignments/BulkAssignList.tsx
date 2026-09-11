"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";

export type AssignableRow = {
  id: string;
  label: string;
  sublabel: string | null;
  href: string | null;
  currentAssigneeName: string | null;
};

export type StaffOption = { id: string; display_name: string | null };

const UNASSIGN = "__unassign__";

/**
 * One reusable bulk-reassign list, driven entirely by which table/column it's
 * pointed at -- the Assignments page reuses this same component for clients
 * (relationship_manager_id), tasks (assigned_staff_id), and engagements
 * (assigned_staff_id / reviewer_id / compliance_officer_id) rather than
 * building three near-identical bulk-select UIs.
 */
export function BulkAssignList({
  rows,
  staffOptions,
  table,
  field,
  entityNoun,
  emptyMessage,
}: {
  rows: AssignableRow[];
  staffOptions: StaffOption[];
  table: "clients" | "tasks" | "engagements";
  field: string;
  entityNoun: string;
  emptyMessage: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // null = nothing chosen yet, so the button stays disabled until the caller
  // makes an explicit choice -- including the explicit "Unassign" option --
  // rather than defaulting to a value that could wipe assignments by accident.
  const [assigneeChoice, setAssigneeChoice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function assignSelected() {
    if (selected.size === 0 || assigneeChoice === null) return;
    const nextValue = assigneeChoice === UNASSIGN ? null : assigneeChoice;
    setSaving(true);
    const { error } = await supabase
      .from(table)
      .update({ [field]: nextValue } as never)
      .in("id", Array.from(selected));
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(`${selected.size} ${entityNoun}${selected.size === 1 ? "" : "s"} reassigned`, "success");
    setSelected(new Set());
    setAssigneeChoice(null);
    router.refresh();
  }

  if (rows.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm">
        <span className="text-muted">{selected.size} selected</span>
        <select
          value={assigneeChoice ?? ""}
          onChange={(e) => setAssigneeChoice(e.target.value || null)}
          aria-label="Assign to"
          className="rounded-lg border border-border px-2 py-1 text-xs"
        >
          <option value="" disabled>
            Assign to...
          </option>
          <option value={UNASSIGN}>Unassign</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.display_name ?? "Staff"}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={assignSelected}
          disabled={selected.size === 0 || assigneeChoice === null || saving}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90 disabled:opacity-40"
        >
          {saving ? "Assigning..." : "Assign selected"}
        </button>
      </div>

      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
        <li className="flex items-center gap-3 bg-surfaceMuted px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">
          <input
            type="checkbox"
            checked={selected.size === rows.length}
            onChange={toggleAll}
            aria-label="Select all"
            className="h-4 w-4 rounded border-border"
          />
          <span className="flex-1">Select all ({rows.length})</span>
        </li>
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={selected.has(row.id)}
              onChange={() => toggle(row.id)}
              aria-label={`Select ${row.label}`}
              className="h-4 w-4 rounded border-border"
            />
            <div className="min-w-0 flex-1">
              {row.href ? (
                <Link href={row.href} className="truncate font-medium text-slate hover:text-accent hover:underline">
                  {row.label}
                </Link>
              ) : (
                <span className="truncate font-medium text-slate">{row.label}</span>
              )}
              {row.sublabel && <p className="truncate text-xs text-muted">{row.sublabel}</p>}
            </div>
            <span className={`shrink-0 text-xs ${row.currentAssigneeName ? "text-slate" : "text-muted"}`}>
              {row.currentAssigneeName ?? "Unassigned"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
