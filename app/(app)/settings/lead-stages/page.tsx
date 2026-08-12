import { ListOrdered } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { LeadStagesManager } from "@/components/settings/LeadStagesManager";

export const dynamic = "force-dynamic";

export default async function LeadStagesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: stages }, { data: isAdmin }] = await Promise.all([
    supabase
      .from("lead_stages")
      .select("id, key, label, display_order, is_entry_stage")
      .eq("workspace_id", workspace.id)
      .order("display_order"),
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
  ]);

  return (
    <div className="max-w-2xl">
      <SettingsSectionHeader
        icon={ListOrdered}
        title="Lead Stages"
        description="The stages a prospect moves through on the Leads board before becoming a client. Every office runs its lead process differently -- rename, add, remove, or reorder these to match yours."
      />

      {!isAdmin && <p className="mt-4 text-sm text-muted">Only workspace admins can edit lead stages.</p>}

      <div className="mt-6">
        <LeadStagesManager workspaceId={workspace.id} stages={stages ?? []} canEdit={Boolean(isAdmin)} />
      </div>
    </div>
  );
}
