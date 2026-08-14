"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export function ConnectStripeButton({ connectStatus, error }: { connectStatus: string; error: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [disconnecting, setDisconnecting] = useState(false);

  async function disconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/stripe/connect/disconnect", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't disconnect Stripe.");
      toast.show("Stripe disconnected", "success");
      router.refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Couldn't disconnect Stripe.", "error");
    } finally {
      setDisconnecting(false);
    }
  }

  const isConnected = connectStatus !== "not_connected";

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">Stripe Connect (payments to your firm)</p>
          <p className="text-xs text-muted">
            Link your own Stripe account so client payments go directly to it -- Verexa never holds the funds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${CONNECT_STATUS_STYLE[connectStatus] ?? CONNECT_STATUS_STYLE.not_connected}`}>
            {CONNECT_STATUS_LABEL[connectStatus] ?? connectStatus}
          </span>
          {isConnected ? (
            <button
              type="button"
              onClick={disconnect}
              disabled={disconnecting}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          ) : (
            <a
              href="/api/stripe/connect/start"
              className="inline-block rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
            >
              Connect your Stripe account
            </a>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
