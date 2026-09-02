"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type StaffOption = { id: string; display_name: string | null };
type Mode = "owner" | "round_robin";

// Governs who a NEW client actually gets assigned to the moment they enter
// the CRM (see resolve_client_relationship_manager / the auto-assign
// trigger on clients) -- distinct from the "Default assignments" card
// above, which only presets a suggestion shown in the picker until someone
// manually chooses. This is real, automatic assignment.
export function ClientAutoAssignmentForm({
  workspaceId,
  mode: initialMode,
  staffPool: initialPool,
  staffOptions,
}: {
  workspaceId: string;
  mode: string;
  staffPool: string[];
  staffOptions: StaffOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(initialMode === "round_robin" ? "round_robin" : "owner");
  const [pool, setPool] = useState<string[]>(initialPool);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(nextMode: Mode, nextPool: string[]) {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("workspaces")
      .update({ client_assignment_mode: nextMode, client_assignment_staff_pool: nextPool })
      .eq("id", workspaceId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    toast.show("Assignment setting saved", "success");
    router.refresh();
  }

  function changeMode(next: Mode) {
    setMode(next);
    save(next, pool);
  }

  function toggleStaff(id: string) {
    const next = pool.includes(id) ? pool.filter((s) => s !== id) : [...pool, id];
    setPool(next);
    save(mode, next);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => changeMode("owner")}
          disabled={saving}
          className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm transition disabled:opacity-60 ${
            mode === "owner" ? "border-accent bg-accentSoft text-accent" : "border-border text-slate hover:bg-surfaceMuted"
          }`}
        >
          <p className="font-medium">Always assign to me</p>
          <p className="mt-0.5 text-xs text-muted">Every new client with no specific staff member involved comes to you.</p>
        </button>
        <button
          type="button"
          onClick={() => changeMode("round_robin")}
          disabled={saving || staffOptions.length === 0}
          className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm transition disabled:opacity-60 ${
            mode === "round_robin" ? "border-accent bg-accentSoft text-accent" : "border-border text-slate hover:bg-surfaceMuted"
          }`}
        >
          <p className="font-medium">Round-robin across selected staff</p>
          <p className="mt-0.5 text-xs text-muted">Splits new clients evenly across whichever staff you pick below.</p>
        </button>
      </div>

      {mode === "round_robin" && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Eligible staff</p>
          {staffOptions.length === 0 ? (
            <p className="mt-1 text-xs text-muted">No staff on this workspace yet.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {staffOptions.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm text-slate">
                  <input
                    type="checkbox"
                    checked={pool.includes(s.id)}
                    disabled={saving}
                    onChange={() => toggleStaff(s.id)}
                    className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                  />
                  {s.display_name ?? "Staff"}
                </label>
              ))}
            </div>
          )}
          {pool.length === 0 && <p className="mt-1.5 text-xs text-amber">Pick at least one -- until you do, new clients fall back to you.</p>}
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
