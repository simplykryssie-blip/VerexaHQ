import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/serverAuth";
import { generateInviteToken, hashInviteToken } from "@/lib/earlyAccess/inviteToken";

const ALLOWED_EXPIRY_DAYS = [7, 14, 30];

export async function POST(req: NextRequest) {
  let user, supabase;
  try {
    ({ user, supabase } = await authenticateRequest(req));
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (isAdmin !== true) {
    return NextResponse.json({ ok: false, error: "Platform admin access required." }, { status: 403 });
  }

  const payload = (await req.json().catch(() => null)) as {
    campaignId?: string;
    applicationId?: string | null;
    email?: string;
    expiresInDays?: number;
  } | null;

  const campaignId = payload?.campaignId?.trim();
  const email = payload?.email?.trim().toLowerCase();
  const expiresInDays = ALLOWED_EXPIRY_DAYS.includes(payload?.expiresInDays ?? -1)
    ? (payload?.expiresInDays as number)
    : 14;

  if (!campaignId || !email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "A campaign and a valid email are required." }, { status: 400 });
  }

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: invitation, error } = await supabase
    .from("early_access_invitations")
    .insert({
      campaign_id: campaignId,
      application_id: payload?.applicationId ?? null,
      email,
      token_hash: tokenHash,
      status: "created",
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select("id, email, status, expires_at, created_at")
    .single();

  if (error || !invitation) {
    return NextResponse.json(
      { ok: false, error: "Unable to create the invitation. It may already exist for this email." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, invitation, token });
}
