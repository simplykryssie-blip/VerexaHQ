"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type Preview = { ero_name: string; status: string; expires_at: string | null; relationship_type: string };

const PARENT_TIER_LABEL: Record<string, string> = {
  ero_ptin: "ERO",
  service_bureau_ero: "Service Bureau",
  service_bureau_ptin: "Service Bureau",
};

export function RedeemConnectionForm({ workspaceId, initialToken }: { workspaceId: string; initialToken?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [token, setToken] = useState(initialToken ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialToken) void lookup(initialToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken]);

  async function lookup(value: string) {
    setPreviewError(null);
    setPreview(null);
    if (!value.trim()) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("get_firm_connection_invite_preview", { p_token: value.trim() });
    setLoading(false);
    if (error || !data || data.length === 0) {
      setPreviewError("This invite link is invalid.");
      return;
    }
    setPreview(data[0]);
  }

  async function connect() {
    setLoading(true);
    const { error } = await supabase.rpc("redeem_firm_connection_invite", { p_token: token.trim(), p_workspace_id: workspaceId });
    setLoading(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(`Connected to ${preview?.ero_name}.`, "success");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste your invite code"
          className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="button"
          onClick={() => lookup(token)}
          disabled={loading || !token.trim()}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent disabled:opacity-60"
        >
          Look up
        </button>
      </div>

      {previewError && <p className="text-sm text-danger">{previewError}</p>}

      {preview && (
        <div className="rounded-lg bg-surfaceMuted p-3 text-sm">
          {preview.status !== "pending" ? (
            <p className="text-danger">This invite has already been used or was revoked.</p>
          ) : preview.expires_at && new Date(preview.expires_at) < new Date() ? (
            <p className="text-danger">This invite has expired. Ask them to send a new one.</p>
          ) : (
            <>
              <p className="text-slate">
                Connect to <span className="font-medium text-ink">{preview.ero_name}</span>{" "}
                <span className="text-muted">({PARENT_TIER_LABEL[preview.relationship_type] ?? "firm"})</span>?
              </p>
              <p className="mt-1 text-xs text-muted">
                You&apos;ll keep your own workspace and login. You can share client files with them once ready for filing, and only
                they can disconnect you.
              </p>
              <button
                type="button"
                onClick={connect}
                disabled={loading}
                className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
              >
                {loading ? "Connecting..." : "Connect"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
