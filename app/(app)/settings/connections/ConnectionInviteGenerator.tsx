"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function ConnectionInviteGenerator({ workspaceId }: { workspaceId: string }) {
  const supabase = createClient();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    const { data, error } = await supabase.rpc("create_firm_connection_invite", {
      p_workspace_id: workspaceId,
      p_relationship_type: "ero_ptin",
    });
    setLoading(false);
    if (error || !data) {
      toast.show(error?.message ?? "Could not create an invite.", "error");
      return;
    }
    setInviteUrl(`${window.location.origin}/settings/connections?token=${data.invite_token}`);
  }

  return (
    <div>
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {loading ? "Generating..." : "Generate invite link"}
      </button>

      {inviteUrl && (
        <div className="mt-3 rounded-lg bg-surfaceMuted p-3 text-sm text-slate">
          <p>Send this link to the PTIN you want to connect. It expires in 14 days.</p>
          <p className="mt-1 break-all font-mono text-xs text-accent">{inviteUrl}</p>
        </div>
      )}
    </div>
  );
}
