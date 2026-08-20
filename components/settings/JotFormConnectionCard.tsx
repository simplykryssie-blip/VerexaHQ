"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/Badge";

export function JotFormConnectionCard({ workspaceId, isConnected }: { workspaceId: string; isConnected: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!apiKey.trim()) {
      setError("Paste your JotForm API key.");
      return;
    }
    setConnecting(true);
    const { error: rpcError } = await supabase.rpc("set_workspace_jotform_api_key", {
      p_workspace_id: workspaceId,
      p_api_key: apiKey.trim(),
    });
    setConnecting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setApiKey("");
    toast.show("JotForm connected", "success");
    router.refresh();
  }

  async function disconnect() {
    if (!window.confirm("Disconnect JotForm? You'll need to re-enter your API key to import forms again.")) return;
    setDisconnecting(true);
    const { error: rpcError } = await supabase.rpc("disconnect_workspace_jotform", { p_workspace_id: workspaceId });
    setDisconnecting(false);
    if (rpcError) {
      toast.show(rpcError.message, "error");
      return;
    }
    toast.show("JotForm disconnected", "success");
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">JotForm</p>
          <p className="text-xs text-muted">
            {isConnected
              ? "Connected -- import JotForm forms as organizer templates from the Organizer Builder."
              : "Connect your firm's JotForm account to import existing forms as organizer templates."}
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
          <form onSubmit={connect} className="flex items-start gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="JotForm API key"
              className="w-56 rounded-lg border border-border px-3 py-1.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
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
      {!isConnected && <p className="mt-2 text-xs text-muted">Find your API key under JotForm &gt; Settings &gt; API.</p>}
    </div>
  );
}
