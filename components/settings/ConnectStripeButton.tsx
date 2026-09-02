"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const CONNECT_STATUS_TONE: Record<string, BadgeTone> = {
  not_connected: "neutral",
  pending: "warning",
  restricted: "danger",
  active: "success",
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
  const [refreshing, setRefreshing] = useState(false);

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

  async function refreshStatus() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/stripe/connect/refresh", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; status?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't refresh Stripe status.");
      toast.show(`Status: ${CONNECT_STATUS_LABEL[data.status ?? ""] ?? data.status}`, "success");
      router.refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Couldn't refresh Stripe status.", "error");
    } finally {
      setRefreshing(false);
    }
  }

  const isConnected = connectStatus !== "not_connected";
  const isFullyActive = connectStatus === "active";

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
          <Badge tone={CONNECT_STATUS_TONE[connectStatus] ?? CONNECT_STATUS_TONE.not_connected} className="capitalize">
            {CONNECT_STATUS_LABEL[connectStatus] ?? connectStatus}
          </Badge>
          {isConnected ? (
            <>
              {!isFullyActive && (
                <button
                  type="button"
                  onClick={refreshStatus}
                  disabled={refreshing}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
                >
                  {refreshing ? "Checking..." : "Refresh status"}
                </button>
              )}
              <button
                type="button"
                onClick={disconnect}
                disabled={disconnecting}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
              >
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </>
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
