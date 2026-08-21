"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/Badge";
import { GhlImportPanel } from "./GhlImportPanel";

export function GhlConnectionCard({ workspaceId, isConnected }: { workspaceId: string; isConnected: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [locationId, setLocationId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!apiKey.trim() || !locationId.trim()) {
      setError("Paste both your Private Integration Token and Location ID.");
      return;
    }
    setConnecting(true);
    const { error: rpcError } = await supabase.rpc("set_workspace_ghl_connection", {
      p_workspace_id: workspaceId,
      p_api_key: apiKey.trim(),
      p_location_id: locationId.trim(),
    });
    setConnecting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setApiKey("");
    setLocationId("");
    toast.show("GoHighLevel connected", "success");
    router.refresh();
  }

  async function disconnect() {
    if (!window.confirm("Disconnect GoHighLevel? You'll need to re-enter your token to import contacts again.")) return;
    setDisconnecting(true);
    const { error: rpcError } = await supabase.rpc("disconnect_workspace_ghl", { p_workspace_id: workspaceId });
    setDisconnecting(false);
    if (rpcError) {
      toast.show(rpcError.message, "error");
      return;
    }
    toast.show("GoHighLevel disconnected", "success");
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">GoHighLevel</p>
          <p className="text-xs text-muted">
            {isConnected ? "Connected -- import your GHL contacts as leads below." : "Connect your GHL sub-account to import its contacts."}
          </p>
        </div>
        <Badge tone={isConnected ? "success" : "neutral"}>{isConnected ? "Connected" : "Not connected"}</Badge>
      </div>

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
          <form onSubmit={connect} className="flex flex-wrap items-start gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Private Integration Token"
              className="w-64 rounded-lg border border-border px-3 py-1.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <input
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              placeholder="Location ID"
              className="w-40 rounded-lg border border-border px-3 py-1.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={connecting}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {connecting ? "Connecting..." : "Connect"}
            </button>
          </form>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {!isConnected && (
        <p className="mt-2 text-xs text-muted">
          In GHL: Settings &gt; Private Integrations &gt; Create New Integration (scope: View Contacts -- add View Notes/Tasks/Appointments,
          Conversations, and Forms too if you plan to import those as well). Location ID is under Settings &gt; Business Profile.
        </p>
      )}

      {isConnected && (
        <div className="mt-4 border-t border-border pt-4">
          <GhlImportPanel />
        </div>
      )}
    </div>
  );
}
