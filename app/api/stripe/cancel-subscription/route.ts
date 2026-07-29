import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/serverAuth";
import { isStripeConfigured } from "@/lib/providerStatus";

// Cancellation policy: the subscription remains active through the current
// (trial) period end rather than ending access immediately -- Stripe's
// cancel_at_period_end=true, not an immediate stripe.subscriptions.cancel().
// Database state is never written here; the customer.subscription.updated
// webhook is the source of truth and will sync cancel_at_period_end once
// Stripe confirms it.
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

  const payload = (await req.json().catch(() => null)) as { workspaceId?: string; resume?: boolean } | null;
  const workspaceId = payload?.workspaceId?.trim();
  if (!workspaceId) return NextResponse.json({ ok: false, error: "Missing workspace." }, { status: 400 });

  const { data: workspace } = await supabase.from("workspaces").select("id, owner_id").eq("id", workspaceId).maybeSingle();
  if (!workspace || workspace.owner_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Only the Account Owner can cancel the subscription." }, { status: 403 });
  }

  const { data: sub } = await supabase.from("workspace_subscriptions").select("external_subscription_id").eq("workspace_id", workspaceId).maybeSingle();
  if (!sub?.external_subscription_id) {
    return NextResponse.json({ ok: false, error: "No active subscription found for this workspace." }, { status: 404 });
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
    await stripe.subscriptions.update(sub.external_subscription_id, { cancel_at_period_end: !(payload?.resume === true) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Couldn't update the subscription." }, { status: 500 });
  }
}
