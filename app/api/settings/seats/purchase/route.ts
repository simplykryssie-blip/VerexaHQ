import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit } from "@/lib/rateLimit";
import { getCurrentWorkspace, workspaceOperationalError } from "@/lib/workspace";
import { previewSeatProrationAmount, ensureSeatSubscriptionItemQuantity, chargeOffSession } from "@/lib/stripe/client";

/**
 * Confirms and pays for one additional staff seat.
 *
 * Order matters: preconditions are checked and the amount is computed
 * BEFORE claim_pending_paid_seat runs, so an unchargeable workspace (no
 * Stripe subscription yet) never creates a pending seat row at all. Once
 * claimed, the seat is charged in isolation (chargeOffSession, not a
 * generic invoice) for the exact previewed proration, and the live
 * subscription's seat item quantity is only ever touched after a confirmed
 * successful charge -- see the migration's own comment for why that
 * ordering means a failed charge never needs a rollback.
 */
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`seat-purchase:${user.id}`, 5, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }
  if (workspace.status === "suspended") {
    return NextResponse.json({ error: workspaceOperationalError(workspace) }, { status: 403 });
  }

  const service = createServiceClient();

  const { data: summary, error: summaryError } = await supabase.rpc("get_workspace_seat_summary", { p_workspace_id: workspace.id }).single();
  if (summaryError || !summary) {
    return NextResponse.json({ error: summaryError?.message ?? "Could not load seat information" }, { status: 400 });
  }

  const { data: subscription } = await service
    .from("workspace_subscriptions")
    .select("stripe_subscription_id, stripe_customer_id, default_payment_method_id, seat_addon_subscription_item_id, stripe_status")
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (
    !subscription?.stripe_subscription_id ||
    !subscription.stripe_customer_id ||
    !subscription.default_payment_method_id ||
    subscription.stripe_status !== "active"
  ) {
    return NextResponse.json(
      { error: "This workspace doesn't have an active subscription with a payment method on file yet -- a seat can't be purchased." },
      { status: 400 }
    );
  }

  const newQuantity = summary.active_paid_seats + 1;
  const preview = await previewSeatProrationAmount({
    stripeSubscriptionId: subscription.stripe_subscription_id,
    existingItemId: subscription.seat_addon_subscription_item_id,
    priceCents: summary.per_seat_price_cents,
    newQuantity,
  });
  if (!preview.ok) {
    return NextResponse.json({ error: preview.reason }, { status: 400 });
  }

  // Only claims the pending-seat slot (and its double-click/concurrency
  // guard) once we know the workspace is actually chargeable.
  const { data: seat, error: claimError } = await supabase.rpc("claim_pending_paid_seat", { p_workspace_id: workspace.id });
  if (claimError || !seat) {
    return NextResponse.json({ error: claimError?.message ?? "Could not start seat purchase" }, { status: 400 });
  }

  const charge = await chargeOffSession({
    customerId: subscription.stripe_customer_id,
    paymentMethodId: subscription.default_payment_method_id,
    amountCents: preview.data.amountCents,
    description: `Verexa additional staff seat -- prorated for the remainder of this billing period`,
    metadata: { type: "staff_seat_purchase", workspace_id: workspace.id, seat_id: seat.id },
    idempotencyKey: `seat-purchase:${seat.id}`,
  });

  if (!charge.ok) {
    await service.rpc("mark_paid_seat_failed", { p_seat_id: seat.id, p_failure_reason: charge.reason });
    return NextResponse.json({ status: "payment_failed", error: charge.reason, proratedAmountCents: preview.data.amountCents });
  }

  await service.rpc("record_seat_payment_intent", { p_seat_id: seat.id, p_stripe_payment_intent_id: charge.data.id });

  if (charge.data.status !== "succeeded") {
    // Ambiguous/pending outcome (e.g. requires additional authentication) --
    // left pending; the payment_intent.succeeded/.payment_failed webhook
    // resolves it either way, including recovering from a crash right here.
    return NextResponse.json({ status: "pending", proratedAmountCents: preview.data.amountCents });
  }

  const { data: activation } = await service
    .rpc("activate_paid_seat", { p_seat_id: seat.id, p_stripe_payment_intent_id: charge.data.id, p_prorated_amount_cents: preview.data.amountCents })
    .single();

  if (activation?.did_activate) {
    const itemResult = await ensureSeatSubscriptionItemQuantity({
      stripeSubscriptionId: subscription.stripe_subscription_id,
      existingItemId: subscription.seat_addon_subscription_item_id,
      priceCents: summary.per_seat_price_cents,
      quantity: newQuantity,
    });
    if (itemResult.ok && !subscription.seat_addon_subscription_item_id) {
      await service.rpc("record_seat_addon_item", { p_workspace_id: workspace.id, p_stripe_item_id: itemResult.data.id });
    }
  }

  return NextResponse.json({ status: "active", proratedAmountCents: preview.data.amountCents });
}
