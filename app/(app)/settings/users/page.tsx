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

export const dynamic = 'force-dynamic';

const MEMBER_STATUS_TONE: Record<string, BadgeTone> = { active: "success" };

// A year-plus-old "last activity" reads as abandoned/stale rather than a
// real timestamp -- shown as a relative "time ago" instead below that, so
// this only needs to distinguish "recent" from "a while".
function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

type MemberRow = {
  id: string;
  user_id: string;
  status: string;
  is_owner: boolean;
  role_id: string;
  display_name: string | null;
  avatar_url: string | null;
  role_name: string | null;
  email: string | null;
  joined_at: string | null;
  last_seen_at: string | null;
  assignedClientCount: number;
  openTaskCount: number;
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
  const [{ data: membersRaw, error: membersError }, { data: roles }, { data: invitationsRaw }, { data: isAdmin }, { data: emailRows }] =
    await Promise.all([
      supabase
        .from("workspace_users")
        .select("id, user_id, status, is_owner, role_id, joined_at")
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
      supabase.rpc("get_workspace_member_emails", { p_workspace_id: workspace.id }),
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
  const emailByUserId = new Map((emailRows ?? []).map((r) => [r.user_id, r.email]));
  const [{ data: profiles }, { data: taskRows }, { data: clientRmRows }, { data: engagementRows }] = userIds.length
    ? await Promise.all([
        supabase.from("user_profiles").select("id, display_name, avatar_url, last_seen_at").in("id", userIds),
        // Open tasks: anything not yet completed, assigned directly to this person.
        supabase.from("tasks").select("assigned_staff_id, status").eq("workspace_id", workspace.id).in("assigned_staff_id", userIds),
        // Assigned clients: a client relationship-managed by this person...
        supabase.from("clients").select("id, relationship_manager_id").eq("workspace_id", workspace.id).in("relationship_manager_id", userIds),
        // ...or one whose engagement this person is the assigned preparer on --
        // a client can show up in both sets, so these get de-duplicated by
        // client id below rather than summed.
        supabase.from("engagements").select("client_id, assigned_staff_id").eq("workspace_id", workspace.id).in("assigned_staff_id", userIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const openTaskCountByUser = new Map<string, number>();
  for (const t of taskRows ?? []) {
    if (t.status === "completed" || !t.assigned_staff_id) continue;
    openTaskCountByUser.set(t.assigned_staff_id, (openTaskCountByUser.get(t.assigned_staff_id) ?? 0) + 1);
  }
  const assignedClientIdsByUser = new Map<string, Set<string>>();
  function addAssignedClient(userId: string | null, clientId: string | null) {
    if (!userId || !clientId) return;
    if (!assignedClientIdsByUser.has(userId)) assignedClientIdsByUser.set(userId, new Set());
    assignedClientIdsByUser.get(userId)!.add(clientId);
  }
  for (const c of clientRmRows ?? []) addAssignedClient(c.relationship_manager_id, c.id);
  for (const e of engagementRows ?? []) addAssignedClient(e.assigned_staff_id, e.client_id);

  const members: MemberRow[] = (membersRaw ?? []).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    status: m.status,
    is_owner: m.is_owner,
    role_id: m.role_id,
    display_name: profileById.get(m.user_id)?.display_name ?? null,
    avatar_url: profileById.get(m.user_id)?.avatar_url ?? null,
    role_name: roleNameById.get(m.role_id) ?? null,
    email: emailByUserId.get(m.user_id) ?? null,
    joined_at: m.joined_at,
    last_seen_at: profileById.get(m.user_id)?.last_seen_at ?? null,
    assignedClientCount: assignedClientIdsByUser.get(m.user_id)?.size ?? 0,
    openTaskCount: openTaskCountByUser.get(m.user_id) ?? 0,
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
          <ChangeMemberRoleSelect memberId={m.id} currentRoleId={m.role_id} roles={roles ?? []} />
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
