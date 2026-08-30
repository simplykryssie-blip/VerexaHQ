import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { KeyRound } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { RolesManager } from "@/components/settings/RolesManager";
import { WorkspaceStaffDefaultsForm } from "@/components/settings/WorkspaceStaffDefaultsForm";
import { ClientAutoAssignmentForm } from "@/components/settings/ClientAutoAssignmentForm";

export const dynamic = "force-dynamic";

const EFIN_WORKSPACE_TYPES = new Set(["ero_office", "service_bureau", "multi_office_firm"]);

export default async function RolesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: roles }, { data: permissions }, { data: rolePermissions }, { data: overrides }, { data: members }, { data: isAdmin }] =
    await Promise.all([
      supabase
        .from("roles")
        .select("id, name, slug, description, workspace_id, is_system_role")
        .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
        .order("is_system_role", { ascending: false })
        .order("name"),
      supabase.from("permissions").select("id, key, category, description").order("category").order("key"),
      supabase.from("role_permissions").select("role_id, permission_id"),
      supabase.from("role_permission_overrides").select("role_id, permission_id, granted").eq("workspace_id", workspace.id),
      supabase.from("workspace_users").select("role_id").eq("workspace_id", workspace.id).eq("status", "active"),
      supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "roles.manage" }),
    ]);

  // Client-level Relationship manager/Reviewer/Compliance officer only show
  // for an ERO/Service Bureau (see ClientWorkspace.tsx's showStaffRoles) --
  // presetting a default for them makes sense on the exact same workspaces.
  const showStaffDefaults = EFIN_WORKSPACE_TYPES.has(workspace.workspace_type);
  const [{ data: staffDefaults }, { data: activeMembers }] = showStaffDefaults
    ? await Promise.all([
        supabase
          .from("workspaces")
          .select(
            `default_relationship_manager:user_profiles!workspaces_default_relationship_manager_id_fkey(id, display_name),
            default_reviewer:user_profiles!workspaces_default_reviewer_id_fkey(id, display_name),
            default_compliance_officer:user_profiles!workspaces_default_compliance_officer_id_fkey(id, display_name),
            client_assignment_mode, client_assignment_staff_pool`
          )
          .eq("id", workspace.id)
          .single(),
        supabase.from("workspace_users").select("user_id").eq("workspace_id", workspace.id).eq("status", "active"),
      ])
    : [{ data: null }, { data: null }];
  // Queried separately from workspace_users rather than via an embedded
  // select -- user_profiles isn't directly FK'd from workspace_users (both
  // it and workspace_users.user_id independently reference auth.users),
  // which PostgREST can't auto-embed across.
  const staffUserIds = (activeMembers ?? []).map((m) => m.user_id);
  const { data: staffProfiles } = staffUserIds.length
    ? await supabase.from("user_profiles").select("id, display_name").in("id", staffUserIds)
    : { data: [] };
  const staffOptions = staffProfiles ?? [];

  const memberCountByRole = new Map<string, number>();
  for (const m of members ?? []) {
    memberCountByRole.set(m.role_id, (memberCountByRole.get(m.role_id) ?? 0) + 1);
  }

  const permissionIdsByRole = new Map<string, Set<string>>();
  for (const rp of rolePermissions ?? []) {
    const set = permissionIdsByRole.get(rp.role_id) ?? new Set<string>();
    set.add(rp.permission_id);
    permissionIdsByRole.set(rp.role_id, set);
  }

  // This workspace's own overrides on top of a role's global default set -- granted=true
  // adds a permission this workspace turned on, granted=false removes one it turned off.
  // Only ever applies to System roles; a workspace's own custom roles have no default to
  // override in the first place.
  for (const o of overrides ?? []) {
    const set = permissionIdsByRole.get(o.role_id) ?? new Set<string>();
    if (o.granted) set.add(o.permission_id);
    else set.delete(o.permission_id);
    permissionIdsByRole.set(o.role_id, set);
  }

  const roleRows = (roles ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    workspace_id: r.workspace_id,
    is_system_role: r.is_system_role,
    permissionIds: Array.from(permissionIdsByRole.get(r.id) ?? []),
    memberCount: memberCountByRole.get(r.id) ?? 0,
  }));

  return (
    <div className="max-w-6xl">
      <SettingsSectionHeader
        icon={KeyRound}
        title="Roles & Permissions"
        description="System roles are shared across every Verexa workspace, but the permissions you toggle for one apply only to your workspace -- no one else's PTIN Preparer role changes when you edit yours. Custom roles are yours alone to create and configure."
      />

      <div className="mt-6">
        <RolesManager workspaceId={workspace.id} roles={roleRows} permissions={permissions ?? []} isAdmin={Boolean(isAdmin)} />
      </div>

      {showStaffDefaults && isAdmin && (
        <div className="mt-6 max-w-2xl">
          <SettingsCard
            title="Default assignments"
            description="Who a new client defaults to before anyone manually assigns them. Reviewer and Compliance officer also apply as the default for new clients created in a connected downline firm -- Relationship manager stays local to whichever firm the client belongs to."
          >
            <WorkspaceStaffDefaultsForm
              workspaceId={workspace.id}
              relationshipManager={(staffDefaults as unknown as { default_relationship_manager: { id: string; display_name: string | null } | null } | null)?.default_relationship_manager ?? null}
              reviewer={(staffDefaults as unknown as { default_reviewer: { id: string; display_name: string | null } | null } | null)?.default_reviewer ?? null}
              complianceOfficer={(staffDefaults as unknown as { default_compliance_officer: { id: string; display_name: string | null } | null } | null)?.default_compliance_officer ?? null}
              staffOptions={staffOptions}
            />
          </SettingsCard>

          <div className="mt-6">
            <SettingsCard
              title="New client assignment"
              description="Who a client actually gets assigned to the moment they enter the CRM through anything other than a staff member adding their own client -- a public intake form, a portal signup, or any automated path. A staff member adding their own client is always assigned to themselves, no matter what's set here."
            >
              <ClientAutoAssignmentForm
                workspaceId={workspace.id}
                mode={(staffDefaults as unknown as { client_assignment_mode?: string } | null)?.client_assignment_mode ?? "owner"}
                staffPool={(staffDefaults as unknown as { client_assignment_staff_pool?: string[] } | null)?.client_assignment_staff_pool ?? []}
                staffOptions={staffOptions}
              />
            </SettingsCard>
          </div>
        </div>
      )}
    </div>
  );
}
