import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Users, Lock } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { Avatar } from "@/components/Avatar";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { InviteStaffForm } from "./InviteStaffForm";
import { RevokeInvitationButton } from "./RevokeInvitationButton";
import { ResendInvitationButton } from "./ResendInvitationButton";
import { RemoveMemberButton } from "./RemoveMemberButton";
import { ChangeMemberRoleSelect } from "@/components/settings/ChangeMemberRoleSelect";
import { canInviteStaff } from "@/lib/workspaceCapabilities";
import { getWorkspaceMemberWorkload, type WorkspaceMemberWorkload } from "@/lib/workspaceStaff";
import { timeAgo } from "@/lib/timeAgo";

export const dynamic = 'force-dynamic';

const MEMBER_STATUS_TONE: Record<string, BadgeTone> = { active: "success" };

type MemberRow = WorkspaceMemberWorkload;

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
  const [{ members, roles }, { data: invitationsRaw }, { data: isAdmin }] = await Promise.all([
    getWorkspaceMemberWorkload(supabase, workspace.id),
    supabase
      .from("workspace_invitations")
      .select("id, email, role_id, status, expires_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "users.manage" }),
  ]);

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
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
        <Link href={`/settings/users/${m.user_id}`} className="flex items-center gap-2 hover:underline">
          <Avatar name={m.display_name} url={m.avatar_url} size="sm" />
          <span className="text-slate">{m.display_name ?? "--"}</span>
          {m.is_owner && <span className="text-xs text-accent">Owner</span>}
        </Link>
      ),
    },
    { key: "email", header: "Email", render: (m) => <span className="text-slate">{m.email ?? "--"}</span> },
    {
      key: "role",
      header: "Role",
      render: (m) => {
        const canChangeRole = isAdmin && !m.is_owner && m.status === "active";
        return canChangeRole ? (
          <ChangeMemberRoleSelect memberId={m.id} currentRoleId={m.role_id} roles={roles} />
        ) : (
          <span className="text-slate">{m.role_name ?? "--"}</span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (m) => (
        <Badge tone={MEMBER_STATUS_TONE[m.status] ?? "neutral"} className="capitalize">
          {m.status}
        </Badge>
      ),
    },
    {
      key: "workload",
      header: "Workload",
      render: (m) => (
        <span className="text-slate">
          {m.assignedClientCount} client{m.assignedClientCount === 1 ? "" : "s"} &middot; {m.openTaskCount} open task
          {m.openTaskCount === 1 ? "" : "s"}
        </span>
      ),
    },
    {
      key: "lastActivity",
      header: "Last Activity",
      render: (m) => <span className="text-muted">{timeAgo(m.last_seen_at)}</span>,
    },
    {
      key: "dateAdded",
      header: "Date Added",
      render: (m) => <span className="text-muted">{m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "--"}</span>,
    },
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
    <div className="max-w-5xl">
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
            <InviteStaffForm roles={roles} />
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
