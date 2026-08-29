"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function ConnectedPtinRow({
  connectionId,
  name,
  tierLabel,
  status,
  billingResponsibility,
  sharesCommunicationsIdentity,
  allowsBrandingOverride,
}: {
  connectionId: string;
  name: string;
  tierLabel: string;
  status: string;
  billingResponsibility: string;
  sharesCommunicationsIdentity: boolean;
  allowsBrandingOverride: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function toggleComms() {
    setBusy("comms");
    const { error } = await supabase
      .from("firm_connections")
      .update({ shares_communications_identity: !sharesCommunicationsIdentity })
      .eq("id", connectionId);
    setBusy(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function toggleBrandingOverride() {
    setBusy("branding");
    const { error } = await supabase
      .from("firm_connections")
      .update({ allows_branding_override: !allowsBrandingOverride })
      .eq("id", connectionId);
    setBusy(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function toggleBilling() {
    setBusy("billing");
    const endpoint = billingResponsibility === "ero" ? "release-billing" : "accept-billing";
    const res = await fetch(`/api/firm-connections/${connectionId}/${endpoint}`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      toast.show(data.error ?? "Could not update billing.", "error");
      return;
    }
    if (data.stripeSync && !data.stripeSync.ok) {
      toast.show(`Saved, but Stripe sync failed: ${data.stripeSync.reason}`, "error");
    } else {
      toast.show(billingResponsibility === "ero" ? "Billing returned to the PTIN." : "You're now covering this PTIN's billing.", "success");
    }
    router.refresh();
  }

  async function disconnect() {
    if (!confirm(`Disconnect ${name} (${tierLabel})? They'll keep their own workspace and data, but will no longer be able to share filings with you.`)) return;
    setBusy("disconnect");
    const res = await fetch(`/api/firm-connections/${connectionId}/disconnect`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      toast.show(data.error ?? "Could not disconnect.", "error");
      return;
    }
    router.refresh();
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <div>
        <p className="font-medium text-slate">
          {name} <span className="font-normal text-muted">({tierLabel})</span>
        </p>
        <p className="text-xs capitalize text-muted">
          {status} {status === "active" && `· ${billingResponsibility === "ero" ? "You cover billing" : "They pay their own way"}`}
        </p>
      </div>
      {status === "active" && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleComms}
            disabled={busy !== null}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
              sharesCommunicationsIdentity ? "border-accent bg-accentSoft text-accent" : "border-border text-slate hover:border-accent hover:text-accent"
            }`}
          >
            {sharesCommunicationsIdentity ? "Sharing your email/SMS" : "Using their own email/SMS"}
          </button>
          <button
            type="button"
            onClick={toggleBrandingOverride}
            disabled={busy !== null}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
              allowsBrandingOverride ? "border-accent bg-accentSoft text-accent" : "border-border text-slate hover:border-accent hover:text-accent"
            }`}
          >
            {allowsBrandingOverride ? "Can set their own logo/color" : "Fully branded by you"}
          </button>
          <button
            type="button"
            onClick={toggleBilling}
            disabled={busy !== null}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {billingResponsibility === "ero" ? "Release billing" : "Accept billing"}
          </button>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy !== null}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-danger transition hover:border-danger disabled:opacity-60"
          >
            Disconnect
          </button>
        </div>
      )}
    </li>
  );
}
