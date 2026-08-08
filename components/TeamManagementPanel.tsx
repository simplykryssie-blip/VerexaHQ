"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Copy, Plus, RefreshCw, UserMinus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendlyError";
import { getStaffNames } from "@/lib/workspaceMembers";

type RoleRow = { id: string; slug: string; name: string };

type TeamMemberRow = {
  id: string; // workspace_users.id
  user_id: string;
  status: string; // invited | active | suspended | removed
  is_owner: boolean;
  role_id: string;
  role_name: string;
  display_name: string;
  last_active_at: string | null;
};

type InvitationRow = {
  id: string;
  email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  token: string;
  role_id: string;
  role_name: string;
  expires_at: string;
  created_at: string;
};

function InvitationStatusBadge({ status, expiresAt }: { status: InvitationRow["status"]; expiresAt: string }) {
  const isExpired = status === "pending" && new Date(expiresAt).getTime() < Date.now();
  const effective = isExpired ? "expired" : status;
  const style: Record<string, string> = {
    pending: "bg-blue-50 text-blue-700",
    accepted: "bg-emerald-50 text-emerald-700",
    expired: "bg-amber-50 text-amber-700",
    revoked: "bg-paper text-muted",
  };
  const label: Record<string, string> = { pending: "Pending", accepted: "Accepted", expired: "Expired", revoked: "Revoked" };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style[effective]}`}>{label[effective]}</span>;
}

export default function TeamManagementPanel() {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showSuccess, showError } = useToast();
  const isAdmin = Boolean(activeWorkspace?.isAdmin);

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [freshLink, setFreshLink] = useState<{ email: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMemberRow | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setError(null);

    const [rolesRes, membersRes, invitationsRes] = await Promise.all([
      supabase
        .from("roles")
        .select("id, slug, name")
        .or(`workspace_id.is.null,workspace_id.eq.${activeWorkspaceId}`)
        .order("name"),
      supabase
        .from("workspace_users")
        .select("id, user_id, status, is_owner, role_id, last_active_at, role:roles(name)")
        .eq("workspace_id", activeWorkspaceId)
        .order("created_at", { ascending: true }),
      isAdmin
        ? supabase
            .from("workspace_invitations")
            .select("id, email, status, token, role_id, expires_at, created_at, role:roles(name)")
            .eq("workspace_id", activeWorkspaceId)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as unknown[], error: null }),
    ]);

    if (membersRes.error) {
      setError(friendlyError(membersRes.error, "Couldn't load your team."));
      setLoading(false);
      return;
    }

    const roleRows = (rolesRes.data as RoleRow[]) ?? [];
    setRoles(roleRows);
    setInviteRoleId((current) => current || roleRows.find((r) => r.slug === "staff")?.id || roleRows[0]?.id || "");

    const rawMembers = (membersRes.data as any[]) ?? [];
    const nameMap = await getStaffNames(rawMembers.map((m) => m.user_id));
    setMembers(
      rawMembers.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        status: m.status,
        is_owner: m.is_owner,
        role_id: m.role_id,
        role_name: m.role?.name ?? "Team member",
        display_name: nameMap.get(m.user_id) ?? "Team member",
        last_active_at: m.last_active_at,
      })),
    );

    if (invitationsRes.error) {
      setError(friendlyError(invitationsRes.error, "Couldn't load pending invitations."));
    } else {
      setInvitations(
        ((invitationsRes.data as any[]) ?? []).map((inv) => ({
          id: inv.id,
          email: inv.email,
          status: inv.status,
          token: inv.token,
          role_id: inv.role_id,
          role_name: inv.role?.name ?? "Team member",
          expires_at: inv.expires_at,
          created_at: inv.created_at,
        })),
      );
    }
    setLoading(false);
  }, [activeWorkspaceId, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  function buildInviteLink(token: string) {
    return `${window.location.origin}/team/accept/${token}`;
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspaceId || !inviteEmail.trim() || !inviteRoleId) return;
    setInviting(true);
    setInviteError(null);
    const { data, error: inviteErr } = await supabase.rpc("create_workspace_invitation", {
      p_workspace_id: activeWorkspaceId,
      p_email: inviteEmail.trim(),
      p_role_id: inviteRoleId,
    });
    setInviting(false);
    if (inviteErr || !data) {
      setInviteError(friendlyError(inviteErr, "Couldn't send that invitation."));
      return;
    }
    setFreshLink({ email: data.email, link: buildInviteLink(data.token) });
    setInviteEmail("");
    setShowInvite(false);
    showSuccess("Invitation created.");
    void load();
  }

  async function resend(inv: InvitationRow) {
    if (!activeWorkspaceId) return;
    setBusyId(inv.id);
    // create_workspace_invitation upserts on (workspace_id, email) while
    // status = 'pending' — calling it again regenerates the token and
    // resets the 7-day expiry, which is exactly a "resend".
    const { data, error: resendErr } = await supabase.rpc("create_workspace_invitation", {
      p_workspace_id: activeWorkspaceId,
      p_email: inv.email,
      p_role_id: inv.role_id,
    });
    setBusyId(null);
    if (resendErr || !data) {
      showError(friendlyError(resendErr, "Couldn't resend that invitation."));
      return;
    }
    setFreshLink({ email: inv.email, link: buildInviteLink(data.token) });
    showSuccess("Invitation refreshed.");
    void load();
  }

  async function revoke(inv: InvitationRow) {
    setBusyId(inv.id);
    const { error: revokeErr } = await supabase.from("workspace_invitations").update({ status: "revoked" }).eq("id", inv.id);
    setBusyId(null);
    if (revokeErr) {
      showError(friendlyError(revokeErr, "Couldn't revoke that invitation."));
      return;
    }
    showSuccess("Invitation revoked.");
    void load();
  }

  async function changeRole(member: TeamMemberRow, roleId: string) {
    setBusyId(member.id);
    const { error: roleErr } = await supabase.from("workspace_users").update({ role_id: roleId }).eq("id", member.id);
    setBusyId(null);
    if (roleErr) {
      showError(friendlyError(roleErr, "Couldn't change that team member's role."));
      return;
    }
    showSuccess("Role updated.");
    void load();
  }

  async function removeMember(member: TeamMemberRow) {
    if (!activeWorkspaceId) return;
    setBusyId(member.id);
    const { error: removeErr } = await supabase.rpc("revoke_workspace_user", {
      p_workspace_id: activeWorkspaceId,
      p_user_id: member.user_id,
    });
    setBusyId(null);
    setRemoveTarget(null);
    if (removeErr) {
      showError(friendlyError(removeErr, "Couldn't remove that team member."));
      return;
    }
    showSuccess("Team member removed.");
    void load();
  }

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <p className="text-sm text-muted">Loading team…</p>;

  const activeMembers = members.filter((m) => m.status !== "removed");
  const visibleInvitations = invitations.filter((inv) => inv.status === "pending" || inv.status === "expired");

  return (
    <div className="max-w-3xl space-y-5">
      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-ink">Team members</h2>
          {isAdmin && (
            <button
              onClick={() => {
                setInviteError(null);
                setShowInvite(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-[#108A64] px-3.5 py-2 text-sm font-semibold text-white"
            >
              <Plus size={15} /> Invite team member
            </button>
          )}
        </div>
        {!isAdmin && <p className="mt-1 text-xs text-muted">Only workspace owners/admins can invite, change roles, or remove team members.</p>}
        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="mt-4 divide-y divide-line">
          {activeMembers.length === 0 ? (
            <p className="py-4 text-sm text-muted">No team members found.</p>
          ) : (
            activeMembers.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="font-semibold text-ink">{m.display_name || "Team member"}</div>
                  <div className="text-xs text-muted">
                    {m.status}
                    {m.last_active_at ? ` · Last active ${new Date(m.last_active_at).toLocaleDateString()}` : ""}
                  </div>
                </div>
                {isAdmin && !m.is_owner ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={m.role_id}
                      disabled={busyId === m.id}
                      onChange={(e) => changeRole(m, e.target.value)}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setRemoveTarget(m)}
                      disabled={busyId === m.id}
                      className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-brick disabled:opacity-50"
                    >
                      <UserMinus size={13} /> Remove
                    </button>
                  </div>
                ) : (
                  <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold">
                    {m.is_owner ? "Account Owner" : m.role_name}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {isAdmin && (
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-bold text-ink">Pending invitations</h2>
          {visibleInvitations.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No pending invitations.</p>
          ) : (
            <div className="mt-3 divide-y divide-line">
              {visibleInvitations.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <div className="font-semibold text-ink">{inv.email}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      {inv.role_name}
                      <InvitationStatusBadge status={inv.status} expiresAt={inv.expires_at} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={busyId === inv.id}
                      onClick={() => resend(inv)}
                      className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
                    >
                      <RefreshCw size={12} /> Resend
                    </button>
                    <button
                      disabled={busyId === inv.id}
                      onClick={() => revoke(inv)}
                      className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-brick disabled:opacity-50"
                    >
                      <Ban size={12} /> Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {freshLink && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-800">
            Invitation ready for {freshLink.email}. Email delivery isn&apos;t connected yet for team invitations — share this secure link directly.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={freshLink.link}
              className="flex-1 rounded-sm border border-line bg-white px-3 py-2 font-mono text-xs text-ink"
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={() => copyLink(freshLink.link)}
              className="flex items-center gap-1.5 rounded-sm border border-line bg-white px-3 py-2 text-xs font-semibold text-ink"
            >
              <Copy size={13} /> {copied ? "Copied" : "Copy"}
            </button>
            <button onClick={() => setFreshLink(null)} className="rounded-sm border border-line bg-white px-3 py-2 text-xs font-semibold text-ink">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showInvite && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-sm border border-line bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="font-slab text-lg font-bold text-ink">Invite team member</h3>
              <button onClick={() => setShowInvite(false)} className="text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={sendInvite} className="space-y-3">
              <input
                required
                type="email"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
              <select
                value={inviteRoleId}
                onChange={(e) => setInviteRoleId(e.target.value)}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              {inviteError && <div className="rounded-sm border border-brick/30 bg-brick/10 px-3 py-2 text-xs text-brick">{inviteError}</div>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowInvite(false)} className="flex-1 rounded-sm border border-line py-2 text-sm font-semibold text-ink">
                  Cancel
                </button>
                <button type="submit" disabled={inviting} className="flex-1 rounded-sm bg-ink py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {inviting ? "Sending…" : "Send invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {removeTarget && (
        <ConfirmDialog
          open
          title={`Remove ${removeTarget.display_name || "this team member"}?`}
          description="They will lose access to this workspace immediately."
          destructive
          busy={busyId === removeTarget.id}
          confirmLabel="Remove"
          onConfirm={() => removeMember(removeTarget)}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}
