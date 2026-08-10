"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import type { PortalUserRow } from "./ClientWorkspaceTabs";

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
}: {
  clientId: string;
  workspaceId: string;
  name: string;
  email: string | null;
  portalUsers: PortalUserRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);

  const existing = email ? portalUsers.find((p) => p.invited_email.toLowerCase() === email.toLowerCase()) : undefined;

  if (existing) {
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

    await fetch("/api/portal-invitations/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, invitedEmail: email, invitedName: name, acceptUrl }),
    });

    setInviting(false);
    toast.show("Portal invitation sent", "success");
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
