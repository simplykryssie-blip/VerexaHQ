"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

// archive_client/restore_client (Contacts Reconciliation Audit, Product
// Decision #14): a lighter, fully reversible cousin of mark_client_lost --
// closes open engagements and cancels open document requests, but never
// touches invoices, tasks, documents, messages, appointments, or portal
// access. "Lost" is a separate, stronger terminal state (voids invoices)
// and isn't archivable from here, matching the same lead/active/inactive
// eligibility set Fix #3's bulk status action already uses.
export function ArchiveClientButton({ clientId, lifecycleStatus }: { clientId: string; lifecycleStatus: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (lifecycleStatus === "lost") return null;

  if (lifecycleStatus === "archived") {
    async function restore() {
      setSaving(true);
      const { error: rpcError } = await supabase.rpc("restore_client", { p_client_id: clientId });
      setSaving(false);
      if (rpcError) {
        toast.show(rpcError.message, "error");
        return;
      }
      toast.show("Client restored", "success");
      router.refresh();
    }
    return (
      <button
        type="button"
        onClick={restore}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accentSoft disabled:opacity-60"
      >
        <ArchiveRestore size={14} /> {saving ? "Restoring..." : "Restore"}
      </button>
    );
  }

  async function archive() {
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("archive_client", { p_client_id: clientId });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setOpen(false);
    toast.show("Client archived", "success");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-accent"
      >
        <Archive size={14} /> Archive
      </button>

      {open && (
        <Modal title="Archive client" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <p className="text-xs text-muted">
              This closes their open engagement(s) and cancels any open document request(s), and removes them from active-work counts. Their
              record, documents, tasks, and messages are untouched, and this can be undone at any time with Restore.
            </p>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
                Cancel
              </button>
              <button
                type="button"
                onClick={archive}
                disabled={saving}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Archive"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
