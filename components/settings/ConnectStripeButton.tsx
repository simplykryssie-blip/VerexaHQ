"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { useAal2Gate } from "@/components/mfa/Aal2GateProvider";

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

// aal2Required covers both /api/stripe/connect/start and .../callback (the
// OAuth redirect flow): the server can only signal this back via a query
// param, not a JSON body, since the browser left this page entirely for
// Stripe's own OAuth screen in between -- see those two routes'
// aal2_required param. Renders the same "Set Up Two-Factor Authentication"
// CTA the in-page Aal2GateProvider dialog uses, for the one gated action
// here that never reaches that dialog at all.
export function ConnectStripeButton({
  connectStatus,
  error,
  aal2Required,
}: {
  connectStatus: string;
  error: string | null;
  aal2Required?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { handleAal2Response } = useAal2Gate();
  const [disconnecting, setDisconnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function disconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/stripe/connect/disconnect", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        if (await handleAal2Response(res, data)) return;
        throw new Error(data.error ?? "Couldn't disconnect Stripe.");
      }
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
      if (!res.ok || !data.ok) {
        if (await handleAal2Response(res, data)) return;
        throw new Error(data.error ?? "Couldn't refresh Stripe status.");
      }
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
      {error && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-sm text-danger">{error}</p>
          {aal2Required && (
            <Link
              href={`/settings/security?next=${encodeURIComponent(pathname || "/settings/integrations")}`}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
            >
              Set Up Two-Factor Authentication
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
