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

export function CalendarConnectionCard({
  provider,
  label,
  status,
  accountEmail,
  error,
}: {
  provider: "google" | "microsoft";
  label: string;
  status: "connected" | "disconnected" | "revoked" | "not_connected";
  accountEmail: string | null;
  error: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [disconnecting, setDisconnecting] = useState(false);

  async function disconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/calendar/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error();
      toast.show(`${label} disconnected`, "success");
      router.refresh();
    } catch {
      toast.show(`Couldn't disconnect ${label}.`, "error");
    } finally {
      setDisconnecting(false);
    }
  }

  const displayStatus = status === "not_connected" ? "disconnected" : status;
  const isConnected = status === "connected";

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="text-xs text-muted">
            {isConnected && accountEmail
              ? `Connected as ${accountEmail}`
              : `Sync your appointments to your own ${label} and block times you're already busy on it.`}
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
            href={`/api/calendar/${provider}/connect`}
            className="inline-block rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
          >
            {status === "revoked" ? `Reconnect ${label}` : `Connect ${label}`}
          </a>
        )}
      </div>
    </div>
  );
}
