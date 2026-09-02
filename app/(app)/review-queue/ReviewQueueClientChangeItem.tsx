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
// afterward from the client profile.
function displayValue(change: ChangeRow, value: string | null) {
  if (change.targetColumn === "ssn") {
    return value ? `Ending in ${value}` : "(on file)";
  }
  return value || "(blank)";
}

// A masked last-4 can't tell staff whether a real change happened -- e.g. a
// client editing the first 3-5 digits keeps the same last 4, and "Ending in
// 1234" -> "Ending in 1234" looks like nothing changed at all. Each side
// reveals independently, decrypted on demand (never preloaded): the old
// value is whatever's still on the client record right now (nothing's been
// applied yet), the new value comes from the pending change's own ciphertext.
function SsnRevealValue({ reveal, fallback }: { reveal: () => Promise<string>; fallback: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (value) {
      setValue(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setValue(await reveal());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reveal this value");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono">{value ?? fallback}</span>
      <button type="button" disabled={loading} onClick={handleClick} className="text-accent hover:underline disabled:opacity-60">
        {loading ? "..." : value ? "Hide" : "Reveal"}
      </button>
      {error && <span className="text-danger">{error}</span>}
    </span>
  );
}

export function ReviewQueueClientChangeItem({
  batchId,
  clientId,
  clientName,
  organizerResponseId,
  changes,
}: {
  batchId: string;
  clientId: string;
  clientName: string;
  /** Set when these changes came in as part of a submitted organizer, not a standalone portal edit -- links back to the fuller organizer review. */
  organizerResponseId?: string | null;
  changes: ChangeRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function revealOldSsn() {
    const { data, error } = await supabase.rpc("reveal_client_ssn", { p_client_id: clientId });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async function revealNewSsn(pendingChangeId: string) {
    const { data, error } = await supabase.rpc("reveal_client_pending_change_value", { p_pending_change_id: pendingChangeId });
    if (error) throw new Error(error.message);
    return data as string;
  }

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
    <li key={batchId} className="rounded-2xl border border-border bg-surface shadow-soft p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{clientName}</p>
          <p className="text-xs text-muted">
            {organizerResponseId ? (
              <>
                Submitted with an organizer --{" "}
                <Link href={`/organizers/${organizerResponseId}/review`} className="text-accent hover:underline">
                  view organizer
                </Link>
              </>
            ) : (
              "Submitted via the client portal"
            )}
          </p>
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
            {c.targetColumn === "ssn" ? (
              <>
                <SsnRevealValue reveal={revealOldSsn} fallback={displayValue(c, c.oldValue)} />
                <span className="text-muted"> → </span>
                <SsnRevealValue reveal={() => revealNewSsn(c.id)} fallback={displayValue(c, c.newValueLast4)} />
              </>
            ) : (
              <>
                {displayValue(c, c.oldValue)} <span className="text-muted">→</span> {c.newValue}
              </>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}
