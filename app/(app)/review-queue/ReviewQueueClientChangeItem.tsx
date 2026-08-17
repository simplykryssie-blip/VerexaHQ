"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type ChangeRow = {
  id: string;
  targetTable: string;
  targetColumn: string;
  oldValue: string | null;
  newValue: string;
  newValueLast4: string | null;
};

const COLUMN_LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  business_name: "Business name",
  primary_email: "Email",
  primary_phone: "Phone",
  street: "Street",
  city: "City",
  state: "State",
  zip: "Zip",
  ssn: "SSN",
  date_of_birth: "Date of birth",
};

// primary_email/primary_phone/street/city/state/zip approving adds a new
// primary entry on the client's contact card and keeps the old one as a
// secondary rather than erasing it -- staff can retag or delete either
// afterward from the client profile. ssn's new_value is encrypted
// ciphertext, never safe to render directly; show only the masked last 4.
function displayValue(change: ChangeRow, value: string | null) {
  if (change.targetColumn === "ssn") {
    return value ? `Ending in ${value}` : "(on file)";
  }
  return value || "(blank)";
}

export function ReviewQueueClientChangeItem({
  batchId,
  clientId,
  clientName,
  changes,
}: {
  batchId: string;
  clientId: string;
  clientName: string;
  changes: ChangeRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function approveAll() {
    setBusy("approve");
    for (const change of changes) {
      const { error } = await supabase.rpc("approve_client_pending_change", { p_pending_change_id: change.id });
      if (error) {
        toast.show(error.message, "error");
        setBusy(null);
        return;
      }
    }
    setBusy(null);
    toast.show("Applied to the client record.", "success");
    router.refresh();
  }

  async function rejectAll() {
    if (!confirm(`Reject ${clientName}'s submitted changes? They'll stay as-is on the client record.`)) return;
    setBusy("reject");
    for (const change of changes) {
      const { error } = await supabase.rpc("reject_client_pending_change", { p_pending_change_id: change.id });
      if (error) {
        toast.show(error.message, "error");
        setBusy(null);
        return;
      }
    }
    setBusy(null);
    router.refresh();
  }

  return (
    <li key={batchId} className="rounded-xl border border-border bg-surface p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{clientName}</p>
          <p className="text-xs text-muted">Submitted via the client portal</p>
          {clientId && (
            <Link href={`/clients/${clientId}`} className="mt-1 inline-block text-xs text-accent hover:underline">
              View client
            </Link>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={approveAll}
            disabled={busy !== null}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
          >
            {busy === "approve" ? "Approving..." : "Approve"}
          </button>
          <button
            type="button"
            onClick={rejectAll}
            disabled={busy !== null}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-danger transition hover:border-danger disabled:opacity-60"
          >
            {busy === "reject" ? "Rejecting..." : "Reject"}
          </button>
        </div>
      </div>

      <ul className="mt-3 space-y-1 border-t border-border pt-2">
        {changes.map((c) => (
          <li key={c.id} className="text-xs text-slate">
            <span className="font-medium text-ink">{COLUMN_LABELS[c.targetColumn] ?? c.targetColumn}:</span>{" "}
            {displayValue(c, c.oldValue)} <span className="text-muted">→</span>{" "}
            {c.targetColumn === "ssn" ? displayValue(c, c.newValueLast4) : c.newValue}
          </li>
        ))}
      </ul>
    </li>
  );
}
