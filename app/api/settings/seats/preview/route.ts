import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { previewSeatProrationAmount } from "@/lib/stripe/client";
import { getCurrentWorkspace } from "@/lib/workspace";

// Read-only: shows the admin the current recurring seat price and the
// exact Stripe-computed prorated amount due today, before they confirm
// anything. Never mutates the live subscription or charges anything.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }

  const { data: summary, error: summaryError } = await supabase.rpc("get_workspace_seat_summary", { p_workspace_id: workspace.id }).single();
  if (summaryError || !summary) {
    return NextResponse.json({ error: summaryError?.message ?? "Could not load seat information" }, { status: 400 });
  }

  const { data: subscription } = await supabase
    .from("workspace_subscriptions")
    .select("stripe_subscription_id, seat_addon_subscription_item_id, stripe_status")
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!subscription?.stripe_subscription_id || subscription.stripe_status !== "active") {
    return NextResponse.json({
      summary,
      proratedAmountCents: null,
      currency: null,
      reason: "This workspace has no active Stripe subscription yet, so a seat can't be purchased.",
    });
  }

  const newQuantity = summary.active_paid_seats + 1;
  const preview = await previewSeatProrationAmount({
    stripeSubscriptionId: subscription.stripe_subscription_id,
    existingItemId: subscription.seat_addon_subscription_item_id,
    priceCents: summary.per_seat_price_cents,
    newQuantity,
  });

  if (!preview.ok) {
    return NextResponse.json({ summary, proratedAmountCents: null, currency: null, reason: preview.reason });
  }

  return NextResponse.json({ summary, proratedAmountCents: preview.data.amountCents, currency: preview.data.currency, reason: null });
}
