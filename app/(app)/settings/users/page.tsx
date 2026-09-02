import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Users, Lock, Link2 } from "lucide-react";
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
import { ConnectionInviteGenerator } from "../connections/ConnectionInviteGenerator";
import { ConnectedPtinRow } from "../connections/ConnectedPtinRow";
import { RedeemConnectionForm } from "../connections/RedeemConnectionForm";
import { MyConnectionStatus } from "../connections/MyConnectionStatus";
import { PeerMessagingToggle } from "../connections/PeerMessagingToggle";

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

// firm_connections supports three tiers (ero_ptin, service_bureau_ero,
// service_bureau_ptin) but a workspace can only ever invite the tier
// directly below its own -- an ERO invites PTINs, a Service Bureau invites
// EROs or PTINs directly. Independent PTINs and multi-office firms have no
// tier below them, so they get no invite generator at all.
const CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE: Record<string, string[]> = {
  ero_office: ["ero_ptin"],
  service_bureau: ["service_bureau_ero", "service_bureau_ptin"],
};

const CONNECTED_CHILD_TIER_LABEL: Record<string, string> = {
  ero_ptin: "PTIN",
  service_bureau_ero: "ERO",
  service_bureau_ptin: "PTIN",
};

const PARENT_TIER_LABEL: Record<string, string> = {
  ero_ptin: "ERO",
  service_bureau_ero: "Service Bureau",
  service_bureau_ptin: "Service Bureau",
};

export default async function UsersPage({ searchParams }: { searchParams: { token?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const childRelationshipTypes = CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE[workspace.workspace_type] ?? [];

  const [
    { members, roles },
    { data: invitationsRaw },
    { data: isAdmin },
    { data: canManageConnections },
    { data: connectedChildren },
    { data: myConnectionRows },
    { data: workspaceRow },
  ] = await Promise.all([
    getWorkspaceMemberWorkload(supabase, workspace.id),
    supabase
      .from("workspace_invitations")
      .select("id, email, role_id, status, expires_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "users.manage" }),
    // Both of these go through SECURITY DEFINER RPCs rather than a plain
    // embedded select -- the other side's workspace name/contact info isn't
    // visible under workspaces' own RLS (is_workspace_member(id)) unless the
    // viewer happens to also belong to that workspace, which is only true
    // for the demo accounts. See get_ero_connected_partners/get_my_ero_connection.
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "firm_connections.manage" }),
    childRelationshipTypes.length > 0
      ? supabase.rpc("get_ero_connected_partners", { p_workspace_id: workspace.id, p_relationship_types: childRelationshipTypes })
      : Promise.resolve({ data: [] as never[] }),
    supabase.rpc("get_my_ero_connection", { p_workspace_id: workspace.id }),
    supabase.from("workspaces").select("allow_connected_ptin_messaging").eq("id", workspace.id).maybeSingle(),
  ]);

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  const invitations: InvitationRow[] = (invitationsRaw ?? []).map((i) => ({
    ...i,
    role_name: roleNameById.get(i.role_id) ?? null,
  }));
  const pendingInvitations = invitations.filter((i) => i.status === "pending");
  const myConnection = (myConnectionRows ?? [])[0] ?? null;
  const myConnectionParentLabel = myConnection ? PARENT_TIER_LABEL[myConnection.relationship_type] ?? "firm" : null;
  const canInvite = childRelationshipTypes.length > 0;

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
    <div className="max-w-5xl space-y-10">
      <div>
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

      <div className="border-t border-border pt-10">
        <SettingsSectionHeader
          icon={Link2}
          title="Connections"
          description="Connect your firm to an ERO or Service Bureau, or manage the firms connected to you."
        />

        {canManageConnections && canInvite && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-ink">Connected firms</h3>
            <p className="mt-1 text-sm text-muted">
              Firms connected to you can share a client&apos;s file with you once it&apos;s ready for filing, for your review and
              approval before it can go to e-file.
            </p>

            <div className="mt-3 rounded-2xl border border-border bg-surface shadow-soft">
              {(connectedChildren ?? []).length === 0 ? (
                <EmptyState message="No firms connected yet." />
              ) : (
                <ul className="divide-y divide-border">
                  {(connectedChildren ?? []).map((c) => (
                    <ConnectedPtinRow
                      key={c.connection_id}
                      connectionId={c.connection_id}
                      name={c.name}
                      tierLabel={CONNECTED_CHILD_TIER_LABEL[c.relationship_type] ?? "firm"}
                      status={c.status}
                      billingResponsibility={c.billing_responsibility}
                      sharesCommunicationsIdentity={c.shares_communications_identity}
                      allowsBrandingOverride={c.allows_branding_override}
                    />
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4">
              <ConnectionInviteGenerator workspaceId={workspace.id} availableRelationshipTypes={childRelationshipTypes} />
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <PeerMessagingToggle workspaceId={workspace.id} initialAllowed={Boolean(workspaceRow?.allow_connected_ptin_messaging)} />
            </div>
          </div>
        )}

        <div className="mt-8">
          <h3 className="text-sm font-semibold text-ink">Your {myConnectionParentLabel ?? "ERO/Service Bureau"} connection</h3>
          <p className="mt-1 text-sm text-muted">
            {myConnection
              ? `You're connected to a ${myConnectionParentLabel}. Sharing a client with them is available from that client's engagement page once it's ready for filing.`
              : "If your firm works with an ERO or Service Bureau, connect here using the invite link or code they send you."}
          </p>

          <div className="mt-3 rounded-2xl border border-border bg-surface shadow-soft p-5">
            {myConnection ? (
              <MyConnectionStatus
                connectionId={myConnection.connection_id}
                parentName={myConnection.name}
                parentTierLabel={myConnectionParentLabel ?? "firm"}
                billingResponsibility={myConnection.billing_responsibility}
                sharesCommunicationsIdentity={myConnection.shares_communications_identity}
                allowsBrandingOverride={myConnection.allows_branding_override}
                canDisconnect={Boolean(canManageConnections) && myConnection.billing_responsibility !== "ero"}
              />
            ) : (
              <RedeemConnectionForm workspaceId={workspace.id} initialToken={searchParams.token} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
