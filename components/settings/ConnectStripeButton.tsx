"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

const CONNECT_STATUS_STYLE: Record<string, string> = {
  not_connected: "bg-surfaceMuted text-muted",
  pending: "bg-amber-100 text-amber-700",
  restricted: "bg-danger/10 text-danger",
  active: "bg-green-100 text-green-700",
};

const CONNECT_STATUS_LABEL: Record<string, string> = {
  not_connected: "Not connected",
  pending: "Onboarding in progress",
  restricted: "Restricted",
  active: "Active",
};

export function ConnectStripeButton({ connectStatus }: { connectStatus: string }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function startOnboarding() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/connect/start", { method: "POST" });
      const data = (await res.json()) as { configured?: boolean; url?: string; reason?: string; error?: string };
      if (data.configured && data.url) {
        window.location.href = data.url;
        return;
      }
      toast.show(data.reason ?? data.error ?? "Couldn't start Stripe onboarding.", "error");
    } catch {
      toast.show("Couldn't start Stripe onboarding.", "error");
    } finally {
      setLoading(false);
    }
  }

  const buttonLabel = connectStatus === "not_connected" ? "Connect your Stripe account" : connectStatus === "active" ? "Manage on Stripe" : "Continue onboarding";

  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div>
        <p className="text-sm font-medium text-ink">Stripe Connect (payments to your firm)</p>
        <p className="text-xs text-muted">
          Connect your own Stripe account so client payments go directly to your firm&apos;s balance -- Verexa never holds the funds.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${CONNECT_STATUS_STYLE[connectStatus] ?? CONNECT_STATUS_STYLE.not_connected}`}>
          {CONNECT_STATUS_LABEL[connectStatus] ?? connectStatus}
        </span>
        <button
          type="button"
          onClick={startOnboarding}
          disabled={loading}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {loading ? "Redirecting..." : buttonLabel}
        </button>
      </div>
    </div>
  );
}
