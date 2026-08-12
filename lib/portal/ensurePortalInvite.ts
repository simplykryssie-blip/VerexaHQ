import type { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Sends a portal invite exactly once per client -- checks for an existing
 * client_portal_users row first (any status) so repeated actions (book a
 * consult, then later send an organizer) never re-invite or double-email.
 * No-ops silently if the client has no email on file.
 */
export async function ensurePortalInvite(
  supabase: SupabaseClient,
  { clientId, workspaceId, name, email }: { clientId: string; workspaceId: string; name: string; email: string | null }
) {
  if (!email) return;

  const { data: existing } = await supabase.from("client_portal_users").select("id").eq("client_id", clientId).maybeSingle();
  if (existing) return;

  const { data: invite, error } = await supabase
    .from("client_portal_users")
    .insert({ client_id: clientId, workspace_id: workspaceId, invited_name: name, invited_email: email })
    .select("invitation_token")
    .single();
  if (error || !invite) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
  const acceptUrl = `${appUrl}/portal/accept-invitation?token=${invite.invitation_token}`;

  await fetch("/api/portal-invitations/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, invitedEmail: email, invitedName: name, acceptUrl }),
  });
}
