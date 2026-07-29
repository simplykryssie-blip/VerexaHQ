import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/serverAuth";
import { hashInviteToken } from "@/lib/earlyAccess/inviteToken";

// Unauthenticated, token-gated preview -- the token itself is the secret
// capability (same model as the accept flow), so this only ever returns
// non-sensitive fields needed to render the signup form: masked email,
// plan name/price, and validity. Never the raw token or token_hash.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });

  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return NextResponse.json({ ok: false, error: "Server invitation credential not configured." }, { status: 503 });
  }

  const tokenHash = hashInviteToken(token);
  const { data: invitation } = await supabase
    .from("early_access_invitations")
    .select("email, status, expires_at, plan_code")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!invitation) return NextResponse.json({ ok: false, error: "This invitation link is invalid." }, { status: 404 });
  if (invitation.status === "revoked") return NextResponse.json({ ok: false, error: "This invitation has been revoked." }, { status: 409 });
  if (invitation.status === "accepted") return NextResponse.json({ ok: false, error: "This invitation has already been accepted. Sign in instead." }, { status: 409 });
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "This invitation has expired. Ask for a new one." }, { status: 409 });
  }

  const { data: plan } = await supabase
    .from("subscription_plans")
    .select("plan_name, monthly_price")
    .eq("plan_code", invitation.plan_code || "beta")
    .eq("is_active", true)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    email: invitation.email,
    planName: plan?.plan_name ?? null,
    monthlyPrice: plan?.monthly_price ?? null,
  });
}
