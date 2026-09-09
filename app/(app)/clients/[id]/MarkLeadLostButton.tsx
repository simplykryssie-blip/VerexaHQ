"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

export function MarkLeadLostButton({ clientId, lifecycleStatus }: { clientId: string; lifecycleStatus: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already-terminal statuses have nothing left to mark lost. Everything
  // else -- lead or an already-engaged client (active/inactive) -- can be:
  // marking a client (not just a pre-conversion lead) lost also archives
  // her open engagement(s), voids her unpaid invoice(s), and cancels her
  // open document request(s) in one atomic step (mark_client_lost RPC), so
  // she immediately drops off every actionable dashboard count while still
  // showing up correctly wherever lifecycle_status itself is reported.
  const isLead = lifecycleStatus === "lead";
  if (lifecycleStatus === "lost" || lifecycleStatus === "archived") return null;

  async function markLost() {
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("mark_client_lost", {
      p_client_id: clientId,
      p_reason: reason.trim() || undefined,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setOpen(false);
    toast.show(isLead ? "Lead marked lost" : "Client marked lost", "success");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-danger hover:text-danger"
      >
        <UserX size={14} /> Mark Lost
      </button>

      {open && (
        <Modal title={isLead ? "Mark lead lost" : "Mark client lost"} onClose={() => setOpen(false)}>
          <div className="space-y-3">
            {!isLead && (
              <p className="text-xs text-muted">
                This also archives their open engagement(s), voids any unpaid invoice(s), and cancels any open document request(s) -- so they drop
                out of the dashboard&apos;s actionable counts immediately.
              </p>
            )}
            <label className="flex flex-col gap-1 text-xs text-muted">
              Reason (optional)
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={
                  isLead ? "e.g. went with another firm, priced out, unresponsive" : "e.g. stopped responding, never sent in paperwork"
                }
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
                Cancel
              </button>
              <button
                type="button"
                onClick={markLost}
                disabled={saving}
                className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Mark Lost"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
