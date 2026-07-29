"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Copy, Check, RefreshCw, Ban, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { friendlyError } from "@/lib/friendlyError";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import SendInvitationModal from "@/components/earlyAccess/SendInvitationModal";
import { logAdminActivity } from "@/lib/earlyAccess/logActivity";
import type { EarlyAccessCampaign, EarlyAccessInvitation, InvitationStatus } from "@/lib/earlyAccess/types";

function displayStatus(inv: EarlyAccessInvitation): InvitationStatus | "expired" {
  if (inv.status === "accepted" || inv.status === "revoked") return inv.status;
  if (new Date(inv.expires_at).getTime() < Date.now()) return "expired";
  return inv.status;
}

function StatusBadge({ status }: { status: InvitationStatus | "expired" }) {
  const style: Record<string, string> = {
    created: "bg-paper text-muted",
    sent: "bg-blue-50 text-blue-700",
    opened: "bg-purple-50 text-purple-700",
    accepted: "bg-emerald-50 text-emerald-700",
    expired: "bg-amber-50 text-amber-700",
    revoked: "bg-brick/10 text-brick",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${style[status]}`}>{status}</span>
  );
}

function InvitationsPageInner() {
  const searchParams = useSearchParams();
  const { showSuccess, showError } = useToast();
  const [campaign, setCampaign] = useState<EarlyAccessCampaign | null>(null);
  const [invitations, setInvitations] = useState<EarlyAccessInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") ?? "all");
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<EarlyAccessInvitation | null>(null);
  const [freshLink, setFreshLink] = useState<{ id: string; email: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: campaignRow, error: campaignError } = await supabase
      .from("early_access_campaigns")
      .select("*")
      .eq("slug", "verexahq-v0-2-founding-firm-beta")
      .maybeSingle();
    if (campaignError || !campaignRow) {
      setError(friendlyError(campaignError, "Couldn't load the Early Access campaign."));
      setLoading(false);
      return;
    }
    const c = campaignRow as EarlyAccessCampaign;
    setCampaign(c);
    const { data, error: invError } = await supabase
      .from("early_access_invitations")
      .select("*")
      .eq("campaign_id", c.id)
      .order("created_at", { ascending: false });
    if (invError) {
      setError(friendlyError(invError, "Couldn't load invitations."));
      setLoading(false);
      return;
    }
    setInvitations((data as EarlyAccessInvitation[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resend(inv: EarlyAccessInvitation) {
    setBusyId(inv.id);
    const res = await authenticatedFetch("/api/early-access/invitations/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId: inv.id }),
    });
    const result = (await res.json().catch(() => null)) as
      | { ok: true; email: string; token: string }
      | { ok: false; error: string }
      | null;
    setBusyId(null);
    if (!result || !result.ok) {
      showError(result?.error ?? "Couldn't resend that invitation.");
      return;
    }
    const link = `${window.location.origin}/early-access/accept/${result.token}`;
    setFreshLink({ id: inv.id, email: result.email, link });
    void logAdminActivity({
      campaignId: campaign?.id ?? null,
      action: "invitation_resent",
      entityType: "early_access_invitation",
      entityId: inv.id,
    });
    showSuccess("Invitation resent with a fresh link.");
    void load();
  }

  async function revoke(inv: EarlyAccessInvitation) {
    setBusyId(inv.id);
    const { error: updateError } = await supabase
      .from("early_access_invitations")
      .update({ status: "revoked" })
      .eq("id", inv.id);
    setBusyId(null);
    setRevokeTarget(null);
    if (updateError) {
      showError(friendlyError(updateError, "Couldn't revoke that invitation."));
      return;
    }
    showSuccess("Invitation revoked.");
    void logAdminActivity({
      campaignId: campaign?.id ?? null,
      action: "invitation_revoked",
      entityType: "early_access_invitation",
      entityId: inv.id,
    });
    setInvitations((prev) => prev.map((i) => (i.id === inv.id ? { ...i, status: "revoked" } : i)));
  }

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const filtered = invitations.filter((inv) => statusFilter === "all" || displayStatus(inv) === statusFilter);

  if (loading) return <p className="text-muted">Loading invitations…</p>;
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;
  if (!campaign) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
        No Early Access campaign found.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-line px-3 py-2 text-sm capitalize"
        >
          {["all", "created", "sent", "opened", "accepted", "expired", "revoked"].map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto flex items-center gap-1.5 rounded-xl bg-[#108A64] px-3.5 py-2 text-sm font-semibold text-white"
        >
          <Plus size={15} /> Generate invitation
        </button>
      </div>

      {freshLink && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-800">
            Fresh link generated for {freshLink.email}. This is the only time it can be copied.
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
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={() => setFreshLink(null)}
              className="rounded-sm border border-line bg-white px-3 py-2 text-xs font-semibold text-ink"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
          No invitations match this filter.
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Opened</th>
                <th className="px-4 py-3">Accepted</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const status = displayStatus(inv);
                const canAct = status !== "accepted" && status !== "revoked";
                return (
                  <tr key={inv.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-semibold text-ink">{inv.email}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-4 py-3 text-muted">{inv.sent_at ? new Date(inv.sent_at).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3 text-muted">{inv.opened_at ? new Date(inv.opened_at).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3 text-muted">{inv.accepted_at ? new Date(inv.accepted_at).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3 text-muted">{new Date(inv.expires_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {canAct ? (
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
                            onClick={() => setRevokeTarget(inv)}
                            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-brick disabled:opacity-50"
                          >
                            <Ban size={12} /> Revoke
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <SendInvitationModal
          campaignId={campaign.id}
          campaignName={campaign.name}
          onClose={() => setShowCreate(false)}
          onCreated={() => void load()}
        />
      )}

      {revokeTarget && (
        <ConfirmDialog
          open
          title={`Revoke the invitation for ${revokeTarget.email}?`}
          description="They will no longer be able to accept this invitation link."
          destructive
          busy={busyId === revokeTarget.id}
          confirmLabel="Revoke"
          onConfirm={() => revoke(revokeTarget)}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </div>
  );
}

export default function InvitationsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading invitations…</p>}>
      <InvitationsPageInner />
    </Suspense>
  );
}
