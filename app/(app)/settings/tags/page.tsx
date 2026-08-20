import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Tags as TagsIcon } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { TagsManager } from "@/components/settings/TagsManager";

export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: tags }, { data: canManage }] = await Promise.all([
    supabase.rpc("list_workspace_tags_with_usage", { p_workspace_id: workspace.id }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "automations.manage" }),
  ]);

  return (
    <div className="max-w-3xl">
      <SettingsSectionHeader
        icon={TagsIcon}
        title="Tags"
        description="Every tag in use across your leads and clients, including ones your automations reference but haven't fired yet. Renaming or deleting a tag here updates every automation and record that uses it -- nothing is left pointing at a name that no longer exists."
      />
      <div className="mt-6">
        <TagsManager workspaceId={workspace.id} initialTags={tags ?? []} canManage={Boolean(canManage)} />
      </div>
    </div>
  );
}
