"use client";

import { useState } from "react";
import { Link2, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export type PartnerPurchaseWebhookStatus = {
  configured: boolean;
  endpoint_token: string | null;
  has_secret: boolean;
  rotated_at: string | null;
};

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

// Lets a workspace map its OWN, independent Stripe account's webhook
// deliveries into Verexa without ever connecting that Stripe account to
// Verexa's platform via Stripe Connect -- exactly the situation an existing
// Stripe Payment Link, pasted directly into a public marketing site's HTML,
// is already in. Two steps, both done once per workspace: (1) copy this
// URL into a new Stripe webhook endpoint (Developers -> Webhooks) for the
// checkout.session.completed event; (2) paste back the signing secret
// Stripe shows for that endpoint. After that, every package below with a
// Stripe Payment Link ID set is automatically recognized on purchase.
export function PartnerPurchaseWebhookCard({ workspaceId, canManage, status }: { workspaceId: string; canManage: boolean; status: PartnerPurchaseWebhookStatus }) {
  const supabase = createClient();
  const toast = useToast();
  const [endpointToken, setEndpointToken] = useState(status.endpoint_token);
  const [hasSecret, setHasSecret] = useState(status.has_secret);
  const [secretInput, setSecretInput] = useState("");
  const [working, setWorking] = useState(false);

  const endpointUrl = endpointToken && typeof window !== "undefined" ? `${window.location.origin}/api/partner-purchase-webhook/${endpointToken}` : null;

  async function setUp() {
    setWorking(true);
    const { data, error } = await supabase.rpc("ensure_partner_purchase_webhook", { p_workspace_id: workspaceId });
    setWorking(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setEndpointToken(data as unknown as string);
  }

  async function saveSecret() {
    if (!secretInput.trim()) return;
    setWorking(true);
    const { error } = await supabase.rpc("set_partner_purchase_webhook_secret", { p_workspace_id: workspaceId, p_signing_secret: secretInput.trim() });
    setWorking(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setHasSecret(true);
    setSecretInput("");
    toast.show("Signing secret saved.", "success");
  }

  function copyUrl() {
    if (!endpointUrl) return;
    void navigator.clipboard.writeText(endpointUrl);
    toast.show("Webhook URL copied.", "success");
  }

  if (!canManage) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <Link2 size={16} className="text-muted" aria-hidden="true" />
        <p className="font-medium text-slate">External purchase webhook</p>
      </div>
      <p className="mt-1 text-sm text-muted">
        Required once, so a purchase through your own Stripe Payment Links is recognized automatically. Map each package to a Payment Link below.
      </p>

      {!endpointToken ? (
        <button
          type="button"
          onClick={setUp}
          disabled={working}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          Set up purchase webhook
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <label className={labelClass}>1. Webhook URL -- add this to Stripe (Developers &gt; Webhooks) for the checkout.session.completed event</label>
            <div className="mt-1 flex gap-2">
              <input readOnly value={endpointUrl ?? ""} className={`${inputClass} mt-0 font-mono text-xs`} />
              <button type="button" onClick={copyUrl} className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium text-slate hover:bg-surfaceMuted">
                Copy
              </button>
            </div>
          </div>
          <div>
            <label className={labelClass}>
              2. Signing secret Stripe shows for that endpoint {hasSecret && <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">Configured</span>}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="password"
                placeholder="whsec_..."
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                className={`${inputClass} mt-0`}
              />
              <button
                type="button"
                onClick={saveSecret}
                disabled={working || !secretInput.trim()}
                className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
              >
                <RefreshCw size={12} aria-hidden="true" /> {hasSecret ? "Rotate" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
