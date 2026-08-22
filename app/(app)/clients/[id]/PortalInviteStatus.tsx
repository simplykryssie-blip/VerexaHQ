"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import type { PendingPortalInviteRow, PortalUserRow } from "./ClientWorkspaceTabs";

// Surfaces portal-invite status/action at the client level regardless of
// client_type -- individual clients have no `contacts` rows, so the
// per-contact invite button (Overview > Contacts, business-only) never
// covered them. This uses the client's own primary_email/name as the
// invite target when no contact-level invite already matches it.
export function PortalInviteStatus({
  clientId,
  workspaceId,
  name,
  email,
  portalUsers,
  pendingInvites,
}: {
  clientId: string;
  workspaceId: string;
  name: string;
  email: string | null;
  portalUsers: PortalUserRow[];
  pendingInvites: PendingPortalInviteRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);
  // pending_portal_invites has RLS enabled with no policies -- only the
  // service-role cron can write to it, a staff session can't mark a row
  // "sent" after a manual retry. Tracked locally instead so a successful
  // retry clears the failed badge immediately without needing a write the
  // browser client isn't allowed to make.
  const [justSent, setJustSent] = useState(false);

  const existing = email ? portalUsers.find((p) => p.invited_email.toLowerCase() === email.toLowerCase()) : undefined;
  // client_portal_users.status only tracks the account's own lifecycle
  // (invited/active) and is set to "invited" the moment the account row is
  // created -- before any email send is even attempted. The real "did the
  // email actually go out" signal lives in pending_portal_invites, queued
  // for a cron worker to drain (see send-pending-portal-invites). Only
  // relevant while the account is still pre-acceptance; once it's active
  // the person clearly already received and used a working invite.
  const latestInvite =
    existing && existing.status !== "active" && !justSent
      ? pendingInvites.find((p) => p.client_portal_user_id === existing.id)
      : undefined;

  async function retry() {
    if (!existing || !email) return;
    setInviting(true);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const acceptUrl = `${appUrl}/portal/accept-invitation?token=${existing.invitation_token}`;
    const emailRes = await fetch("/api/portal-invitations/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, invitedEmail: email, invitedName: name, acceptUrl }),
    });
    const emailResult = await emailRes.json().catch(() => null);
    setInviting(false);
    if (!emailRes.ok || !emailResult?.sent) {
      toast.show(emailResult?.error ?? "Could not send the invite. Share this link with them directly: " + acceptUrl, "error");
    } else {
      toast.show("Portal invitation sent", "success");
      setJustSent(true);
    }
  }

  if (existing) {
    if (latestInvite?.status === "pending") {
      return <span className="text-xs text-muted">Portal: invite queued, not sent yet</span>;
    }
    if (latestInvite?.status === "failed") {
      return (
        <span className="inline-flex items-center gap-2 text-xs">
          <span className="text-red-600" title={latestInvite.error ?? undefined}>
            Portal: invite failed
          </span>
          <button
            type="button"
            onClick={retry}
            disabled={inviting}
            className="font-medium text-accent underline decoration-dotted underline-offset-2 hover:text-accent/80 disabled:opacity-60"
          >
            {inviting ? "Retrying..." : "Retry"}
          </button>
        </span>
      );
    }
    return (
      <span className="text-xs capitalize text-muted">
        Portal: {existing.status}
      </span>
    );
  }

  if (!email) {
    return <span className="text-xs text-muted">Add an email to invite to the portal</span>;
  }

  async function invite() {
    if (!email) return;
    setInviting(true);
    const { data: invite, error } = await supabase
      .from("client_portal_users")
      .insert({ client_id: clientId, workspace_id: workspaceId, invited_name: name, invited_email: email })
      .select("invitation_token")
      .single();
    if (error || !invite) {
      setInviting(false);
      toast.show(error?.message ?? "Could not create invitation.", "error");
      return;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const acceptUrl = `${appUrl}/portal/accept-invitation?token=${invite.invitation_token}`;

    const emailRes = await fetch("/api/portal-invitations/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, invitedEmail: email, invitedName: name, acceptUrl }),
    });
    const emailResult = await emailRes.json().catch(() => null);

    setInviting(false);
    if (!emailRes.ok || !emailResult?.sent) {
      toast.show(`Invite created, but the email couldn't be sent. Share this link with them directly: ${acceptUrl}`, "error");
    } else {
      toast.show("Portal invitation sent", "success");
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={invite}
      disabled={inviting}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent disabled:opacity-60"
    >
      {inviting ? "Inviting..." : "Invite to portal"}
    </button>
  );
}
