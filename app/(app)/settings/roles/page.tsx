import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { KeyRound } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { RolesManager } from "@/components/settings/RolesManager";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: roles }, { data: permissions }, { data: rolePermissions }, { data: members }, { data: isAdmin }] = await Promise.all([
    supabase
      .from("roles")
      .select("id, name, slug, description, workspace_id, is_system_role")
      .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
      .order("is_system_role", { ascending: false })
      .order("name"),
    supabase.from("permissions").select("id, key, category, description").order("category").order("key"),
    supabase.from("role_permissions").select("role_id, permission_id"),
    supabase.from("workspace_users").select("role_id").eq("workspace_id", workspace.id).eq("status", "active"),
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
  ]);

  const memberCountByRole = new Map<string, number>();
  for (const m of members ?? []) {
    memberCountByRole.set(m.role_id, (memberCountByRole.get(m.role_id) ?? 0) + 1);
  }

  const permissionIdsByRole = new Map<string, string[]>();
  for (const rp of rolePermissions ?? []) {
    const list = permissionIdsByRole.get(rp.role_id) ?? [];
    list.push(rp.permission_id);
    permissionIdsByRole.set(rp.role_id, list);
  }

  const roleRows = (roles ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    workspace_id: r.workspace_id,
    is_system_role: r.is_system_role,
    permissionIds: permissionIdsByRole.get(r.id) ?? [],
    memberCount: memberCountByRole.get(r.id) ?? 0,
  }));

  return (
    <div className="max-w-6xl">
      <SettingsSectionHeader
        icon={KeyRound}
        title="Roles & Permissions"
        description="System roles are shared across every Verexa workspace and can't be edited. Custom roles are specific to yours -- create one and pick exactly which permissions it grants."
      />

      <div className="mt-6">
        <RolesManager workspaceId={workspace.id} roles={roleRows} permissions={permissions ?? []} isAdmin={Boolean(isAdmin)} />
      </div>
    </div>
  );
}
