import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/serverAuth";
import { hashInviteToken } from "@/lib/earlyAccess/inviteToken";
import { createEarlyAccessCheckoutSession } from "@/lib/stripeCheckout";
import { TERMS_VERSION, PRIVACY_VERSION, EARLY_ACCESS_BILLING_AUTHORIZATION_VERSION, billingAuthorizationText } from "@/lib/billingAuthorization";

type Body = {
  token?: string;
  email?: string;
  password?: string;
  fullName?: string;
  businessName?: string;
  businessEmail?: string;
  businessPhone?: string;
  agreeToEarlyAccessAgreement?: boolean;
  agreeToTerms?: boolean;
  agreeToBilling?: boolean;
};

export async function POST(req: NextRequest) {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return NextResponse.json({ ok: false, error: "Server invitation credential not configured." }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const token = body?.token?.trim();
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password ?? "";
  const fullName = body?.fullName?.trim();
  const businessName = body?.businessName?.trim();

  if (!token) return NextResponse.json({ ok: false, error: "Missing invitation token." }, { status: 400 });
  if (!email || !fullName || !businessName) {
    return NextResponse.json({ ok: false, error: "Full name, business name, and email are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "Use a password with at least 8 characters." }, { status: 400 });
  }
  if (!body?.agreeToEarlyAccessAgreement || !body?.agreeToTerms || !body?.agreeToBilling) {
    return NextResponse.json({ ok: false, error: "You must accept the Early Access agreement, Terms of Service, and billing authorization to continue." }, { status: 400 });
  }

  const tokenHash = hashInviteToken(token);
  const { data: invitation } = await supabase
    .from("early_access_invitations")
    .select("id, campaign_id, email, status, expires_at, workspace_id, plan_code")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!invitation) return NextResponse.json({ ok: false, error: "This invitation link is invalid." }, { status: 404 });
  if (invitation.status === "revoked") return NextResponse.json({ ok: false, error: "This invitation has been revoked." }, { status: 409 });
  if (invitation.status === "accepted") return NextResponse.json({ ok: false, error: "This invitation has already been accepted. Sign in instead." }, { status: 409 });
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "This invitation has expired. Ask for a new one." }, { status: 409 });
  }
  if (invitation.email.toLowerCase() !== email) {
    return NextResponse.json({ ok: false, error: "Use the email address this invitation was sent to." }, { status: 400 });
  }

  const { data: plan } = await supabase
    .from("subscription_plans")
    .select("plan_name, monthly_price")
    .eq("plan_code", invitation.plan_code || "beta")
    .eq("is_active", true)
    .maybeSingle();
  if (!plan) {
    return NextResponse.json({ ok: false, error: "The plan for this invitation is not configured. Contact support." }, { status: 503 });
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      business_name: businessName,
      provisioning_source: "early_access_invitation",
    },
  });

  if (createError || !created?.user) {
    if (createError?.message?.toLowerCase().includes("already been registered") || createError?.message?.toLowerCase().includes("already registered")) {
      return NextResponse.json({ ok: false, error: "An account already exists for this email. Sign in, then open this invitation link again." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "We could not create your account. Please try again." }, { status: 500 });
  }

  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = req.headers.get("user-agent") || null;

  let workspaceId: string;
  try {
    const { data, error } = await supabase.rpc("provision_early_access_workspace", {
      p_user_id: created.user.id,
      p_invitation_id: invitation.id,
      p_email: email,
      p_full_name: fullName,
      p_business_name: businessName,
      p_business_email: body?.businessEmail?.trim() || null,
      p_business_phone: body?.businessPhone?.trim() || null,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
    });
    if (error || !data) throw new Error(error?.message ?? "Workspace provisioning failed.");
    workspaceId = data as string;
  } catch (error) {
    // The account exists but provisioning didn't complete. Recoverable:
    // the user can sign in and finish setup from Settings -> Subscription,
    // which offers the same checkout-resume path this route uses below.
    return NextResponse.json(
      {
        ok: false,
        error: "Your account was created, but we couldn't finish setting up your workspace. Sign in and check Settings to finish setup, or contact support.",
        recoverable: true,
        detail: error instanceof Error ? error.message : undefined,
      },
      { status: 500 },
    );
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "");
  const successUrl = `${appUrl}/early-access/onboarding?checkout=success`;
  const cancelUrl = `${appUrl}/early-access/onboarding?checkout=canceled`;

  const checkout = await createEarlyAccessCheckoutSession(supabase, {
    workspaceId,
    invitationId: invitation.id,
    successUrl,
    cancelUrl,
    email,
  });

  const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const displayPrice = `$${Number(plan.monthly_price).toFixed(2)}/month`;
  await supabase.rpc("record_billing_authorization", {
    p_workspace_id: workspaceId,
    p_invitation_id: invitation.id,
    p_terms_version: TERMS_VERSION,
    p_ea_agreement_version: null,
    p_billing_authorization_version: EARLY_ACCESS_BILLING_AUTHORIZATION_VERSION,
    p_authorization_text: billingAuthorizationText(displayPrice, trialEnd.toLocaleDateString()),
    p_displayed_price: plan.monthly_price,
    p_currency: "usd",
    p_trial_end: trialEnd.toISOString(),
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
  });

  if (!checkout.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Your account was created, but we couldn't start billing setup: ${checkout.error} You can finish this from Settings once you sign in.`,
        recoverable: true,
        workspaceProvisioned: true,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    checkoutUrl: checkout.checkoutUrl,
    email,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
  });
}
