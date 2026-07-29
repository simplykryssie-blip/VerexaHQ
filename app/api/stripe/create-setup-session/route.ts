import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/serverAuth";
import { isStripeConfigured } from "@/lib/providerStatus";

// Update-payment-method flow. Stripe Checkout in setup mode -- card entry
// stays entirely inside Stripe-hosted UI, never touches our servers or
// database. Completion is confirmed by the checkout.session.completed /
// setup_intent.succeeded webhook handlers, not by this route's response.
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: false, reason: "Stripe is not configured." }, { status: 503 });
  }
  let user, supabase;
  try {
    ({ user, supabase } = await authenticateRequest(req));
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const payload = (await req.json().catch(() => null)) as { workspaceId?: string } | null;
  const workspaceId = payload?.workspaceId?.trim();
  if (!workspaceId) return NextResponse.json({ ok: false, error: "Missing workspace." }, { status: 400 });

  const { data: workspace } = await supabase.from("workspaces").select("id, owner_id").eq("id", workspaceId).maybeSingle();
  if (!workspace || workspace.owner_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Only the Account Owner can update the payment method." }, { status: 403 });
  }

  const { data: sub } = await supabase.from("workspace_subscriptions").select("external_customer_id").eq("workspace_id", workspaceId).maybeSingle();
  if (!sub?.external_customer_id) {
    return NextResponse.json({ ok: false, error: "No billing account found for this workspace yet." }, { status: 404 });
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: sub.external_customer_id,
      success_url: `${appUrl}/settings?tab=subscription&payment_method=updated`,
      cancel_url: `${appUrl}/settings?tab=subscription&payment_method=canceled`,
    });
    if (!session.url) return NextResponse.json({ ok: false, error: "Couldn't start the payment method update." }, { status: 502 });
    return NextResponse.json({ ok: true, checkoutUrl: session.url });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Couldn't start the payment method update." }, { status: 500 });
  }
}
