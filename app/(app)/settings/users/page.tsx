import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Users, Lock } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { Avatar } from "@/components/Avatar";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { InviteStaffForm } from "./InviteStaffForm";
import { RevokeInvitationButton } from "./RevokeInvitationButton";
import { ResendInvitationButton } from "./ResendInvitationButton";
import { RemoveMemberButton } from "./RemoveMemberButton";
import { ChangeMemberRoleSelect } from "@/components/settings/ChangeMemberRoleSelect";
import { canInviteStaff } from "@/lib/workspaceCapabilities";

export const dynamic = 'force-dynamic';

type MemberRow = {
  id: string;
  user_id: string;
  status: string;
  is_owner: boolean;
  role_id: string;
  display_name: string | null;
  avatar_url: string | null;
  role_name: string | null;
};

type InvitationRow = {
  id: string;
  email: string;
  role_id: string;
  status: string;
  expires_at: string;
  role_name: string | null;
};

export default async function UsersPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: membersRaw, error: membersError }, { data: roles }, { data: invitationsRaw }, { data: isAdmin }] = await Promise.all([
    supabase
      .from("workspace_users")
      .select("id, user_id, status, is_owner, role_id")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("roles")
      .select("id, name")
      .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
      .order("name"),
    supabase
      .from("workspace_invitations")
      .select("id, email, role_id, status, expires_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "users.manage" }),
  ]);

  if (membersError) {
    console.error("Users & Staff: could not load workspace_users", membersError);
  }

  // Queried and joined separately rather than via embedded selects
  // (workspace_users.select("...user_profiles(...), roles(...)")) --
  // user_profiles isn't directly FK'd from workspace_users (both it and
  // workspace_users.user_id reference auth.users independently), which
  // PostgREST can't auto-embed across, silently returning zero rows
  // instead of an error. This surfaced as "No workspace members found"
  // even for the workspace owner.
  const roleNameById = new Map((roles ?? []).map((r) => [r.id, r.name]));
  const userIds = Array.from(new Set((membersRaw ?? []).map((m) => m.user_id)));
  const { data: profiles } = userIds.length
    ? await supabase.from("user_profiles").select("id, display_name, avatar_url").in("id", userIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const members: MemberRow[] = (membersRaw ?? []).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    status: m.status,
    is_owner: m.is_owner,
    role_id: m.role_id,
    display_name: profileById.get(m.user_id)?.display_name ?? null,
    avatar_url: profileById.get(m.user_id)?.avatar_url ?? null,
    role_name: roleNameById.get(m.role_id) ?? null,
  }));

  const invitations: InvitationRow[] = (invitationsRaw ?? []).map((i) => ({
    ...i,
    role_name: roleNameById.get(i.role_id) ?? null,
  }));
  const pendingInvitations = invitations.filter((i) => i.status === "pending");

  const memberColumns: DataTableColumn<MemberRow>[] = [
    {
      key: "name",
      header: "Name",
      render: (m) => (
        <div className="flex items-center gap-2">
          <Avatar name={m.display_name} url={m.avatar_url} size="sm" />
          <span className="text-slate">{m.display_name ?? "--"}</span>
          {m.is_owner && <span className="text-xs text-accent">Owner</span>}
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (m) => {
        const canChangeRole = isAdmin && !m.is_owner && m.status === "active";
        return canChangeRole ? (
          <ChangeMemberRoleSelect memberId={m.id} currentRoleId={m.role_id} roles={roles ?? []} />
        ) : (
          <span className="text-slate">{m.role_name ?? "--"}</span>
        );
      },
    },
    { key: "status", header: "Status", render: (m) => <span className="capitalize text-slate">{m.status}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (m) =>
        isAdmin && !m.is_owner && m.status === "active" ? (
          <div className="flex justify-end">
            <RemoveMemberButton workspaceId={workspace.id} userId={m.user_id} name={m.display_name ?? "this member"} />
          </div>
        ) : null,
    },
  ];

  const invitationColumns: DataTableColumn<InvitationRow>[] = [
    { key: "email", header: "Email", render: (i) => <span className="text-slate">{i.email}</span> },
    { key: "role", header: "Role", render: (i) => <span className="text-slate">{i.role_name ?? "--"}</span> },
    { key: "expires", header: "Expires", render: (i) => <span className="text-slate">{new Date(i.expires_at).toLocaleDateString()}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (i) => (
        <div className="flex justify-end gap-2">
          <ResendInvitationButton email={i.email} roleId={i.role_id} />
          <RevokeInvitationButton invitationId={i.id} />
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-3xl">
      <SettingsSectionHeader icon={Users} title="Users & Staff" description="Everyone with access to this workspace." />

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-soft transition hover:shadow-softHover">
        <DataTable columns={memberColumns} rows={members} emptyMessage="No workspace members found." />
      </div>

      {workspace.is_owner && !canInviteStaff(workspace) && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-ink">Invite staff</h3>
          <div className="mt-3 rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState
              icon={Lock}
              message="Independent PTIN workspaces are solo accounts and can't add staff. Upgrade to an ERO Office or Service Bureau workspace to invite team members."
            />
          </div>
        </div>
      )}

      {workspace.is_owner && canInviteStaff(workspace) && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-ink">Invite staff</h3>
          <p className="mt-1 text-sm text-muted">Send an email invitation to add someone to this workspace.</p>
          <div className="mt-3 rounded-2xl border border-border bg-surface shadow-soft p-5">
            <InviteStaffForm roles={roles ?? []} />
          </div>
        </div>
      )}

      {workspace.is_owner && pendingInvitations.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-ink">Pending invitations</h3>
          <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface shadow-soft transition hover:shadow-softHover">
            <DataTable columns={invitationColumns} rows={pendingInvitations} emptyMessage="No pending invitations." />
          </div>
        </div>
      )}
    </div>
  );
}
