"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

type Status = {
  configured: boolean;
  hasSecret: boolean;
  rotatedAt: string | null;
  endpointUrl: string | null;
};

export function PartnerPurchaseWebhookSettings() {
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    const response = await fetch("/api/settings/partner-purchase-webhook", { cache: "no-store" });
    if (!response.ok) return;
    setStatus(await response.json());
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveSecret() {
    setSaving(true);
    const response = await fetch("/api/settings/partner-purchase-webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signingSecret: secret }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      toast.show(body.error ?? "Unable to save webhook secret.", "error");
      return;
    }
    setSecret("");
    await load();
    toast.show("Stripe purchase webhook connected.", "success");
  }

  async function copyUrl() {
    if (!status?.endpointUrl) return;
    await navigator.clipboard.writeText(status.endpointUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (!status) {
    return <div className="mt-4 rounded-xl border border-border p-3 text-sm text-muted">Loading Stripe purchase webhook…</div>;
  }

  return (
    <div className="mt-4 rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Stripe Purchase Webhook</p>
          <p className="mt-1 text-sm text-muted">
            Connect the Stripe account that owns these external Payment Links. Verexa stores the signing secret encrypted and never displays it after saving.
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${status.hasSecret ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {status.hasSecret ? "Connected" : "Not connected"}
        </span>
      </div>

      {status.endpointUrl && (
        <div className="mt-3">
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">Webhook URL</label>
          <div className="mt-1 flex gap-2">
            <input readOnly value={status.endpointUrl} className="w-full rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-xs text-ink" />
            <button type="button" onClick={copyUrl} className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-surfaceMuted">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3">
        <label className="block text-xs font-medium uppercase tracking-wide text-muted">
          Stripe webhook signing secret
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="whsec_…"
            autoComplete="new-password"
            disabled={saving}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted"
          />
        </label>
        <button
          type="button"
          onClick={() => void saveSecret()}
          disabled={saving || !secret.trim()}
          className="mt-2 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
        >
          {saving ? "Connecting…" : status.hasSecret ? "Replace Secret" : "Connect Webhook"}
        </button>
        <p className="mt-2 text-xs text-muted">
          In Stripe, open the webhook endpoint, choose the signing secret option, and paste the <code>whsec_…</code> value here.
        </p>
      </div>
    </div>
  );
}
