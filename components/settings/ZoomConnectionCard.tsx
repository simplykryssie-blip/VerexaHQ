"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const STATUS_TONE: Record<string, BadgeTone> = {
  disconnected: "neutral",
  revoked: "danger",
  connected: "success",
};

const STATUS_LABEL: Record<string, string> = {
  disconnected: "Not connected",
  revoked: "Connection expired",
  connected: "Connected",
};

export function ZoomConnectionCard({
  status,
  zoomEmail,
  error,
}: {
  status: "connected" | "disconnected" | "revoked" | "not_connected";
  zoomEmail: string | null;
  error: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [disconnecting, setDisconnecting] = useState(false);

  async function disconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/zoom/disconnect", { method: "POST" });
      if (!res.ok) throw new Error();
      toast.show("Zoom disconnected", "success");
      router.refresh();
    } catch {
      toast.show("Couldn't disconnect Zoom.", "error");
    } finally {
      setDisconnecting(false);
    }
  }

  const displayStatus = status === "not_connected" ? "disconnected" : status;
  const isConnected = status === "connected";

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">Zoom</p>
          <p className="text-xs text-muted">
            {isConnected && zoomEmail ? `Connected as ${zoomEmail}` : "Connect your own Zoom account to create meetings for your appointments."}
          </p>
        </div>
        <Badge tone={STATUS_TONE[displayStatus]}>{STATUS_LABEL[displayStatus]}</Badge>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3">
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
            href="/api/zoom/connect/start"
            className="inline-block rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
          >
            {status === "revoked" ? "Reconnect Zoom" : "Connect Zoom"}
          </a>
        )}
      </div>
    </div>
  );
}
