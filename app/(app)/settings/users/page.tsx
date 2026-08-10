import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Users, Lock } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { InviteStaffForm } from "./InviteStaffForm";
import { RevokeInvitationButton } from "./RevokeInvitationButton";
import { ChangeMemberRoleSelect } from "@/components/settings/ChangeMemberRoleSelect";

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: members }, { data: roles }, { data: invitations }, { data: isAdmin }] = await Promise.all([
    supabase
      .from("workspace_users")
      .select("id, status, is_owner, role_id, user_profiles(display_name), roles(name)")
      .eq("workspace_id", workspace.id)
      .order("created_at" as never, { ascending: true }),
    supabase
      .from("roles")
      .select("id, name")
      .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
      .order("name"),
    supabase
      .from("workspace_invitations")
      .select("id, email, status, expires_at, roles(name)")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
  ]);

  const pendingInvitations = (invitations ?? []).filter((i) => i.status === "pending");

  return (
    <div className="max-w-3xl">
      <SettingsSectionHeader icon={Users} title="Users & Staff" description="Everyone with access to this workspace." />

      <div className="mt-6 rounded-xl border border-border bg-surface">
        {!members || members.length === 0 ? (
          <EmptyState icon={Users} message="No workspace members found." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((m) => {
                const profile = m.user_profiles as unknown as { display_name: string | null } | null;
                const role = m.roles as unknown as { name: string } | null;
                const canChangeRole = isAdmin && !m.is_owner && m.status === "active";
                return (
                  <tr key={m.id}>
                    <td className="px-5 py-3 text-slate">
                      {profile?.display_name ?? "--"}
                      {m.is_owner && <span className="ml-2 text-xs text-accent">Owner</span>}
                    </td>
                    <td className="px-5 py-3 text-slate">
                      {canChangeRole ? (
                        <ChangeMemberRoleSelect memberId={m.id} currentRoleId={m.role_id} roles={roles ?? []} />
                      ) : (
                        role?.name ?? "--"
                      )}
                    </td>
                    <td className="px-5 py-3 capitalize text-slate">{m.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {workspace.is_owner && workspace.workspace_type === "independent_ptin" && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-ink">Invite staff</h3>
          <div className="mt-3 rounded-xl border border-border bg-surface">
            <EmptyState
              icon={Lock}
              message="Independent PTIN workspaces are solo accounts and can't add staff. Upgrade to an ERO Office or Service Bureau workspace to invite team members."
            />
          </div>
        </div>
      )}

      {workspace.is_owner && workspace.workspace_type !== "independent_ptin" && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-ink">Invite staff</h3>
          <p className="mt-1 text-sm text-muted">Send an email invitation to add someone to this workspace.</p>
          <div className="mt-3 rounded-xl border border-border bg-surface p-5">
            <InviteStaffForm roles={roles ?? []} />
          </div>
        </div>
      )}

      {workspace.is_owner && pendingInvitations.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-ink">Pending invitations</h3>
          <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Expires</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pendingInvitations.map((i) => {
                  const role = i.roles as unknown as { name: string } | null;
                  return (
                    <tr key={i.id}>
                      <td className="px-5 py-3 text-slate">{i.email}</td>
                      <td className="px-5 py-3 text-slate">{role?.name ?? "--"}</td>
                      <td className="px-5 py-3 text-slate">{new Date(i.expires_at).toLocaleDateString()}</td>
                      <td className="px-5 py-3 text-right">
                        <RevokeInvitationButton invitationId={i.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
