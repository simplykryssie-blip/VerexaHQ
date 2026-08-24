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
  reissueFor,
}: {
  clientId: string;
  workspaceId: string;
  name: string;
  email: string;
  /** Pass this when the contact's existing invite was revoked (30 days unconfirmed) --
   * the partial unique index on client_portal_users only covers status = 'invited' rows,
   * so a revoked one needs invite_portal_user() to issue a genuinely fresh row/token
   * rather than a plain insert. */
  reissueFor?: { isPrimary: boolean };
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);

  async function invite() {
    setInviting(true);

    const { data: invite, error } = reissueFor
      ? await supabase.rpc("invite_portal_user", { p_client_id: clientId, p_email: email, p_name: name, p_is_primary: reissueFor.isPrimary })
      : await supabase
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
      toast.show(`Invite ${reissueFor ? "reissued" : "created"}, but the email couldn't be sent. Share this link with them directly: ${acceptUrl}`, "error");
    } else {
      toast.show(`Portal invitation ${reissueFor ? "reissued" : "sent"}`, "success");
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
      {inviting ? (reissueFor ? "Reissuing..." : "Inviting...") : reissueFor ? "Reissue invite" : "Invite to portal"}
    </button>
  );
}
