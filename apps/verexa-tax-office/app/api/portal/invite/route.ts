import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/errors";

const CLIENT_MANAGE_ROLES = ["owner", "admin", "ero", "preparer", "reviewer", "intake_specialist"];

// Invites a client to the portal. Same shape as /api/team/invite: the
// service role is only touched after the caller's own session proves they
// can manage this client record, and clients.portal_user_id is set from the
// invite response so the new auth user is linked immediately (there is no
// "pending invite" row type for clients any more than there is for staff).
export async function POST(request: Request) {
  const { clientId } = await request.json();
  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: client } = await supabase.from("clients").select("id, workspace_id, email, first_name, last_name, portal_user_id").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  if (!client.email) return NextResponse.json({ error: "This client has no email address on file." }, { status: 400 });
  if (client.portal_user_id) return NextResponse.json({ error: "This client already has portal access." }, { status: 409 });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", client.workspace_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !CLIENT_MANAGE_ROLES.includes(membership.role)) {
    return NextResponse.json({ error: "You don't have permission to invite this client to the portal." }, { status: 403 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Portal invites aren't available in this environment (service role not configured)." }, { status: 503 });
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(client.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal/reset-password`,
  });

  if (inviteError || !invited.user) {
    logServerError("portal invite", inviteError);
    const message = (inviteError?.message ?? "").toLowerCase();
    if (message.includes("already been registered") || message.includes("already registered")) {
      return NextResponse.json({ error: "That email already has an account. Contact support to link it to this client." }, { status: 409 });
    }
    return NextResponse.json({ error: "Couldn't send the portal invite. Please try again." }, { status: 500 });
  }

  const { error: updateError } = await admin
    .from("clients")
    .update({ portal_user_id: invited.user.id, portal_status: "invited" })
    .eq("id", clientId);

  if (updateError) {
    logServerError("portal invite client link", updateError);
    return NextResponse.json({ error: "Invite email sent, but linking the portal account failed. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
