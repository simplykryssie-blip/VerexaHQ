"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

const TIER_LABEL: Record<string, string> = {
  ero_ptin: "PTIN",
  service_bureau_ero: "ERO",
  service_bureau_ptin: "PTIN",
};

export function ConnectionInviteGenerator({
  workspaceId,
  availableRelationshipTypes,
}: {
  workspaceId: string;
  // Which tier(s) this workspace can invite below it -- an ERO can only
  // ever invite a PTIN, but a Service Bureau can invite either an ERO or a
  // PTIN directly, so it needs a choice instead of a hardcoded type.
  availableRelationshipTypes: string[];
}) {
  const supabase = createClient();
  const toast = useToast();
  const [relationshipType, setRelationshipType] = useState(availableRelationshipTypes[0] ?? "ero_ptin");
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    const { data, error } = await supabase.rpc("create_firm_connection_invite", {
      p_workspace_id: workspaceId,
      p_relationship_type: relationshipType,
    });
    setLoading(false);
    if (error || !data) {
      toast.show(error?.message ?? "Could not create an invite.", "error");
      return;
    }
    // /join works whether the recipient already has a Verexa account or has
    // never signed up -- it previews the invite, handles sign-in/sign-up
    // inline, and auto-creates+connects their workspace with no separate
    // "now go paste this code in Settings" step and no account-type picker.
    setInviteUrl(`${window.location.origin}/join?token=${data.invite_token}`);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        {availableRelationshipTypes.length > 1 && (
          <select
            value={relationshipType}
            onChange={(e) => {
              setRelationshipType(e.target.value);
              setInviteUrl(null);
            }}
            className="rounded-lg border border-border px-2 py-1.5 text-xs font-medium text-slate focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {availableRelationshipTypes.map((type) => (
              <option key={type} value={type}>
                Invite a {TIER_LABEL[type] ?? type}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent disabled:opacity-60"
        >
          {loading ? "Generating..." : "Generate invite link"}
        </button>
      </div>

      {inviteUrl && (
        <div className="mt-3 rounded-lg bg-surfaceMuted p-3 text-sm text-slate">
          <p>Send this link to the {TIER_LABEL[relationshipType] ?? "firm"} you want to connect. It expires in 14 days.</p>
          <p className="mt-1 break-all font-mono text-xs text-accent">{inviteUrl}</p>
        </div>
      )}
    </div>
  );
}
