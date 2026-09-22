"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

// Contacts Pass 6: the mirror of ConvertLeadButton -- reverts an
// accidentally-converted Client (active/inactive) back to Lead. Reuses the
// exact mechanism ConvertLeadButton and the Contacts list's bulk status
// action (bulkContactActions.ts's BULK_STATUS_OPTIONS, which already treats
// lead/active/inactive as one freely-interchangeable set) both already use:
// a bare lifecycle_status update, gated by the existing clients_update RLS
// policy (has_permission(workspace_id, 'clients.edit')). No new RPC, no new
// field, no cascading side effects -- unlike Lost (voids invoices) or
// Archive (closes engagements, cancels document requests), going back to
// Lead doesn't touch engagements/invoices/quotes/payments/documents/notes/
// messages/activity at all, so a plain status write is the whole change.
export function RevertToLeadButton({ clientId, lifecycleStatus }: { clientId: string; lifecycleStatus: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (lifecycleStatus !== "active" && lifecycleStatus !== "inactive") return null;

  async function revert() {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.from("clients").update({ lifecycle_status: "lead" }).eq("id", clientId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setOpen(false);
    toast.show("Reverted to lead", "success");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-accent"
      >
        <Undo2 size={14} /> Revert to Lead
      </button>

      {open && (
        <Modal title="Revert to lead" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <p className="text-xs text-muted">
              This only changes their status back to Lead. Their engagements, invoices, quotes, payments, documents, notes, messages, and
              activity history are all left exactly as they are.
            </p>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
                Cancel
              </button>
              <button
                type="button"
                onClick={revert}
                disabled={saving}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {saving ? "Reverting..." : "Revert to Lead"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
