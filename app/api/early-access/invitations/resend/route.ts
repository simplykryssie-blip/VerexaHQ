import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/serverAuth";
import { generateInviteToken, hashInviteToken } from "@/lib/earlyAccess/inviteToken";

const ALLOWED_EXPIRY_DAYS = [7, 14, 30];

// Resend rotates the token rather than reusing the old one -- the raw token
// was never persisted after the original creation response, so there is no
// old link left to resend. A fresh token is the only correct way to give
// the recipient a working link again, and it also invalidates the old one.
export async function POST(req: NextRequest) {
  let supabase;
  try {
    ({ supabase } = await authenticateRequest(req));
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (isAdmin !== true) {
    return NextResponse.json({ ok: false, error: "Platform admin access required." }, { status: 403 });
  }

  const payload = (await req.json().catch(() => null)) as {
    invitationId?: string;
    expiresInDays?: number;
  } | null;
  const invitationId = payload?.invitationId?.trim();
  const expiresInDays = ALLOWED_EXPIRY_DAYS.includes(payload?.expiresInDays ?? -1)
    ? (payload?.expiresInDays as number)
    : 14;
  if (!invitationId) {
    return NextResponse.json({ ok: false, error: "Missing invitationId." }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("early_access_invitations")
    .select("id, status, email")
    .eq("id", invitationId)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Invitation not found." }, { status: 404 });
  }
  if (existing.status === "accepted") {
    return NextResponse.json({ ok: false, error: "This invitation was already accepted." }, { status: 409 });
  }

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("early_access_invitations")
    .update({ token_hash: tokenHash, status: "created", sent_at: null, opened_at: null, expires_at: expiresAt })
    .eq("id", invitationId);

  if (error) {
    return NextResponse.json({ ok: false, error: "Unable to resend the invitation." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, email: existing.email, token });
}
