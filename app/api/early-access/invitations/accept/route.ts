import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createServiceClient } from "@/lib/serverAuth";
import { hashInviteToken } from "@/lib/earlyAccess/inviteToken";

export async function POST(req: NextRequest) {
  let user, supabase;
  try {
    ({ user, supabase } = await authenticateRequest(req));
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const payload = (await req.json().catch(() => null)) as { token?: string; workspaceId?: string } | null;
  const token = payload?.token?.trim();
  const workspaceId = payload?.workspaceId?.trim();
  if (!token || !workspaceId) {
    return NextResponse.json({ ok: false, error: "Missing invitation token or workspace." }, { status: 400 });
  }

  // Verify membership through the RLS-scoped client rather than trusting the
  // workspace ID the client sent -- ws_select_team's policy is
  // is_workspace_member(id), so this only returns a row if the caller
  // actually belongs to it.
  const { data: membership } = await supabase.from("workspaces").select("id").eq("id", workspaceId).maybeSingle();
  if (!membership) {
    return NextResponse.json({ ok: false, error: "You don't have access to that workspace." }, { status: 403 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ ok: false, error: "Server invitation credential not configured." }, { status: 503 });
  }

  const tokenHash = hashInviteToken(token);
  const { data: invitation } = await service
    .from("early_access_invitations")
    .select("id, status, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!invitation) {
    return NextResponse.json({ ok: false, error: "This invitation link is invalid." }, { status: 404 });
  }
  if (invitation.status === "revoked") {
    return NextResponse.json({ ok: false, error: "This invitation has been revoked." }, { status: 409 });
  }
  if (invitation.status === "accepted") {
    return NextResponse.json({ ok: false, error: "This invitation has already been accepted." }, { status: 409 });
  }
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "This invitation has expired. Ask for a new one." }, { status: 409 });
  }

  const { error: updateError } = await service
    .from("early_access_invitations")
    .update({
      status: "accepted",
      workspace_id: workspaceId,
      accepted_by: user.id,
      accepted_at: new Date().toISOString(),
      opened_at: new Date().toISOString(),
    })
    .eq("id", invitation.id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: "Unable to accept the invitation." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
