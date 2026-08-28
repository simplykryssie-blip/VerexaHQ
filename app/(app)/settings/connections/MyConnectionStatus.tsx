"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

export function MyConnectionStatus({
  connectionId,
  eroName,
  billingResponsibility,
  sharesCommunicationsIdentity,
  allowsBrandingOverride,
  canDisconnect,
}: {
  connectionId: string;
  eroName: string;
  billingResponsibility: string;
  sharesCommunicationsIdentity: boolean;
  allowsBrandingOverride: boolean;
  canDisconnect: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    if (!confirm(`Disconnect from ${eroName}? You'll keep your own workspace and data, but will no longer be able to share filings with them.`)) return;
    setBusy(true);
    const res = await fetch(`/api/firm-connections/${connectionId}/disconnect`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.show(data.error ?? "Could not disconnect.", "error");
      return;
    }
    toast.show(`Disconnected from ${eroName}.`, "success");
    router.refresh();
  }

  return (
    <div>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Connected to</dt>
          <dd className="mt-0.5 font-medium text-ink">{eroName}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Billing</dt>
          <dd className="mt-0.5 text-slate">
            {billingResponsibility === "ero" ? `Covered by ${eroName}` : "You pay for your own subscription and add-ons"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Email &amp; SMS</dt>
          <dd className="mt-0.5 text-slate">
            {sharesCommunicationsIdentity ? `Sending under ${eroName}'s identity` : "Using your own"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Look &amp; feel</dt>
          <dd className="mt-0.5 text-slate">
            {allowsBrandingOverride ? (
              <>
                You can set your own logo/color in{" "}
                <a href="/settings/firm-profile" className="font-medium text-accent hover:underline">
                  Firm Profile
                </a>
              </>
            ) : (
              `Fully branded by ${eroName}`
            )}
          </dd>
        </div>
      </dl>

      {canDisconnect ? (
        <button
          type="button"
          onClick={disconnect}
          disabled={busy}
          className="mt-4 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-danger transition hover:border-danger disabled:opacity-60"
        >
          {busy ? "Disconnecting..." : `Disconnect from ${eroName}`}
        </button>
      ) : billingResponsibility === "ero" ? (
        <p className="mt-4 text-xs text-muted">
          {eroName} covers your billing, so only they can disconnect this connection. If you&apos;d rather manage your own subscription, ask them to
          release billing back to you first.
        </p>
      ) : null}
    </div>
  );
}
