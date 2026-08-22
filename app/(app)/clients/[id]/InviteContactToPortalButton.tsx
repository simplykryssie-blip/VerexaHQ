"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function InviteContactToPortalButton({
  clientId,
  workspaceId,
  name,
  email,
}: {
  clientId: string;
  workspaceId: string;
  name: string;
  email: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);

  async function invite() {
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
      body: JSON.stringify({
        clientId,
        invitedEmail: email,
        invitedName: name,
        acceptUrl,
      }),
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
      className="text-xs font-medium text-accent hover:underline disabled:opacity-60"
    >
      {inviting ? "Inviting..." : "Invite to portal"}
    </button>
  );
}
