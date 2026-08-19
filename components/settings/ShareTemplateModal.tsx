"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export type DownlineWorkspace = { id: string; name: string };

export function ShareTemplateModal({
  table,
  objectId,
  objectName,
  downlineWorkspaces,
  onClose,
}: {
  table: "organizer_templates" | "engagement_letter_templates";
  objectId: string;
  objectName: string;
  downlineWorkspaces: DownlineWorkspace[];
  onClose: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [targetWorkspaceId, setTargetWorkspaceId] = useState(downlineWorkspaces[0]?.id ?? "");
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share(e: React.FormEvent) {
    e.preventDefault();
    if (!targetWorkspaceId) return;
    setSharing(true);
    setError(null);
    const { error } = await supabase.rpc("create_config_object_share", {
      p_table: table,
      p_object_id: objectId,
      p_target_workspace_id: targetWorkspaceId,
    });
    setSharing(false);
    if (error) {
      setError(error.message);
      return;
    }
    const target = downlineWorkspaces.find((w) => w.id === targetWorkspaceId);
    toast.show(`Share sent to ${target?.name ?? "the firm"} -- they'll need to accept it before it copies into their account.`, "success");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-8">
      <form onSubmit={share} className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Share &quot;{objectName}&quot;</h2>
          <button type="button" onClick={onClose} className="text-lg text-muted hover:text-ink">
            ×
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          Sends a copy request to a connected downline firm. They see it as pending and choose to accept or decline --
          nothing is shared automatically, and this doesn&apos;t affect your own template.
        </p>
        <div className="mt-4">
          <label className="block text-xs font-medium text-ink">Share with</label>
          <select
            value={targetWorkspaceId}
            onChange={(e) => setTargetWorkspaceId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {downlineWorkspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
            Cancel
          </button>
          <button
            type="submit"
            disabled={sharing || !targetWorkspaceId}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {sharing ? "Sending..." : "Send share"}
          </button>
        </div>
      </form>
    </div>
  );
}
