"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Copy, Plus, RefreshCw, UserMinus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendlyError";

const INVITE_ROLES = ["Admin", "Manager", "Staff", "Preparer", "Bookkeeper", "Payroll"] as const;

type TeamMemberRow = {
  id: string;
  role: string;
  member_status: string;
  display_name: string | null;
  job_title: string | null;
  user_id: string;
  last_active_at: string | null;
};

type InvitationRow = {
  id: string;
  invite_email: string;
  invited_role: string;
  invitation_status: "sent" | "accepted" | "expired" | "revoked";
  sent_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function roleLabel(role: string) {
  return role === "Owner" ? "Account Owner" : role;
}

function InvitationStatusBadge({ status, expiresAt }: { status: InvitationRow["invitation_status"]; expiresAt: string }) {
  const isExpired = status === "sent" && new Date(expiresAt).getTime() < Date.now();
  const effective = isExpired ? "expired" : status;
  const style: Record<string, string> = {
    sent: "bg-blue-50 text-blue-700",
    accepted: "bg-emerald-50 text-emerald-700",
    expired: "bg-amber-50 text-amber-700",
    revoked: "bg-paper text-muted",
  };
  const label: Record<string, string> = { sent: "Pending", accepted: "Accepted", expired: "Expired", revoked: "Revoked" };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style[effective]}`}>{label[effective]}</span>;
}

export default function TeamManagementPanel() {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showSuccess, showError } = useToast();
  const isOwner = activeWorkspace?.role === "Owner";

  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof INVITE_ROLES)[number]>("Staff");
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
    const [m, i] = await Promise.all([
      supabase
        .from("workspace_members")
        .select("id,role,member_status,display_name,job_title,user_id,last_active_at")
        .eq("workspace_id", activeWorkspaceId)
        .order("created_at", { ascending: true }),
      isOwner
        ? supabase.rpc("list_workspace_member_invitations", { p_workspace_id: activeWorkspaceId })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (m.error) {
      setError(friendlyError(m.error, "Couldn't load your team."));
      setLoading(false);
      return;
    }
    setMembers((m.data as TeamMemberRow[]) ?? []);
    if (i.error) {
      setError(friendlyError(i.error, "Couldn't load pending invitations."));
    } else {
      setInvitations((i.data as InvitationRow[]) ?? []);
    }
    setLoading(false);
  }, [activeWorkspaceId, isOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  function buildInviteLink(invitationId: string) {
    return `${window.location.origin}/team/accept/${invitationId}`;
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspaceId || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    const { data, error: inviteErr } = await supabase.rpc("invite_workspace_member", {
      p_workspace_id: activeWorkspaceId,
      p_invite_email: inviteEmail.trim(),
      p_role: inviteRole,
      p_permissions: {},
    });
    setInviting(false);
    if (inviteErr || !data?.ok) {
      setInviteError(friendlyError(inviteErr, "Couldn't send that invitation."));
      return;
    }
    setFreshLink({ email: data.invite_email, link: buildInviteLink(data.invitation_id) });
    setInviteEmail("");
    setShowInvite(false);
    showSuccess("Invitation created.");
    void load();
  }

  async function resend(inv: InvitationRow) {
    setBusyId(inv.id);
    const { data, error: resendErr } = await supabase.rpc("resend_workspace_member_invitation", { p_invitation_id: inv.id });
    setBusyId(null);
    if (resendErr || !data?.ok) {
      showError(friendlyError(resendErr, "Couldn't resend that invitation."));
      return;
    }
    setFreshLink({ email: inv.invite_email, link: buildInviteLink(inv.id) });
    showSuccess("Invitation refreshed.");
    void load();
  }

  async function revoke(inv: InvitationRow) {
    setBusyId(inv.id);
    const { data, error: revokeErr } = await supabase.rpc("revoke_workspace_member_invitation", { p_invitation_id: inv.id });
    setBusyId(null);
    if (revokeErr || !data?.ok) {
      showError(friendlyError(revokeErr, "Couldn't revoke that invitation."));
      return;
    }
    showSuccess("Invitation revoked.");
    void load();
  }

  async function changeRole(member: TeamMemberRow, role: string) {
    if (!activeWorkspaceId) return;
    setBusyId(member.id);
    const { data, error: roleErr } = await supabase.rpc("set_workspace_member_role", {
      p_workspace_id: activeWorkspaceId,
      p_user_id: member.user_id,
      p_role: role,
    });
    setBusyId(null);
    if (roleErr || !data?.ok) {
      showError(friendlyError(roleErr, "Couldn't change that team member's role."));
      return;
    }
    showSuccess("Role updated.");
    void load();
  }

  async function removeMember(member: TeamMemberRow) {
    if (!activeWorkspaceId) return;
    setBusyId(member.id);
    const { data, error: removeErr } = await supabase.rpc("remove_workspace_member", {
      p_workspace_id: activeWorkspaceId,
      p_user_id: member.user_id,
    });
    setBusyId(null);
    setRemoveTarget(null);
    if (removeErr || !data?.ok) {
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

  const activeMembers = members.filter((m) => m.member_status !== "Removed");
  const visibleInvitations = invitations.filter((inv) => inv.invitation_status === "sent" || inv.invitation_status === "expired");

  return (
    <div className="max-w-3xl space-y-5">
      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-ink">Team members</h2>
          {isOwner && (
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
        {!isOwner && <p className="mt-1 text-xs text-muted">Only the Account Owner can invite, change roles, or remove team members.</p>}
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
                    {m.job_title ? `${m.job_title} · ` : ""}
                    {m.member_status}
                    {m.last_active_at ? ` · Last active ${new Date(m.last_active_at).toLocaleDateString()}` : ""}
                  </div>
                </div>
                {isOwner && m.role !== "Owner" ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={m.role}
                      disabled={busyId === m.id}
                      onChange={(e) => changeRole(m, e.target.value)}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
                    >
                      {INVITE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
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
                  <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold">{roleLabel(m.role)}</span>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {isOwner && (
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-bold text-ink">Pending invitations</h2>
          {visibleInvitations.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No pending invitations.</p>
          ) : (
            <div className="mt-3 divide-y divide-line">
              {visibleInvitations.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <div className="font-semibold text-ink">{inv.invite_email}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      {inv.invited_role}
                      <InvitationStatusBadge status={inv.invitation_status} expiresAt={inv.expires_at} />
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
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as (typeof INVITE_ROLES)[number])}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              >
                {INVITE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
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
