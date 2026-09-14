import { createServiceClient } from "@/lib/supabase/service";
import { ensureSeatSubscriptionItemQuantity } from "@/lib/stripe/client";

type SeatPaymentIntent = {
  id: string;
  amount: number;
  metadata?: { type?: string; workspace_id?: string; seat_id?: string };
};

/**
 * The webhook side of seat activation -- symmetric with the purchase
 * route's own synchronous success path (see app/api/settings/seats/purchase).
 * Both call activate_paid_seat with the same seat_id; its own
 * `where status = 'pending'` guard means only whichever one runs first
 * actually activates and bumps the Stripe item quantity, so this is what
 * makes a crash between the synchronous charge and its activation
 * recoverable, and what makes a duplicate delivery of this same event a
 * pure no-op (on top of Phase 0's own event-level dedup already having
 * prevented this handler from running twice for the same event.id).
 */
export async function handleStaffSeatPaymentIntentSucceeded(
  supabase: ReturnType<typeof createServiceClient>,
  intent: SeatPaymentIntent
): Promise<{ skipped?: string }> {
  const seatId = intent.metadata?.seat_id;
  const workspaceId = intent.metadata?.workspace_id;
  if (!seatId || !workspaceId) return { skipped: "missing seat_id/workspace_id metadata" };

  const { data: activation } = await supabase
    .rpc("activate_paid_seat", { p_seat_id: seatId, p_stripe_payment_intent_id: intent.id, p_prorated_amount_cents: intent.amount })
    .single();

  if (!activation?.did_activate) return { skipped: "seat already resolved" };

  const { data: subscription } = await supabase
    .from("workspace_subscriptions")
    .select("stripe_subscription_id, seat_addon_subscription_item_id, plan_id, platform_subscription_plans(per_seat_price_cents)")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!subscription?.stripe_subscription_id) return { skipped: "no matching subscription" };
  const plan = subscription.platform_subscription_plans as { per_seat_price_cents: number } | null;
  if (!plan) return { skipped: "workspace has no plan" };

  // get_workspace_seat_summary is deliberately authenticated-only (it
  // gates on is_workspace_admin, which resolves off auth.uid() -- there is
  // no signed-in user in a webhook context) -- the service-role-safe
  // equivalent is just counting directly, which RLS never blocks for a
  // service-role client anyway.
  const { count: activePaidSeats } = await supabase
    .from("workspace_paid_seats")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "active");

  const itemResult = await ensureSeatSubscriptionItemQuantity({
    stripeSubscriptionId: subscription.stripe_subscription_id,
    existingItemId: subscription.seat_addon_subscription_item_id,
    priceCents: plan.per_seat_price_cents,
    quantity: activePaidSeats ?? 1,
  });
  if (itemResult.ok && !subscription.seat_addon_subscription_item_id) {
    await supabase.rpc("record_seat_addon_item", { p_workspace_id: workspaceId, p_stripe_item_id: itemResult.data.id });
  }

  return {};
}

/**
 * Symmetric failure path -- only acts when this payment intent was for a
 * staff seat (metadata.type === "staff_seat_purchase"); the main webhook
 * route checks that before ever calling this, so the existing generic
 * handlePaymentIntentFailed (client invoices/payment plans) is completely
 * untouched and still runs for every other payment_intent.payment_failed
 * event.
 */
export async function handleStaffSeatPaymentIntentFailed(
  supabase: ReturnType<typeof createServiceClient>,
  intent: SeatPaymentIntent & { last_payment_error?: { message?: string } | null }
): Promise<{ skipped?: string }> {
  const seatId = intent.metadata?.seat_id;
  if (!seatId) return { skipped: "missing seat_id metadata" };

  await supabase.rpc("mark_paid_seat_failed", { p_seat_id: seatId, p_failure_reason: intent.last_payment_error?.message ?? "Payment failed" });
  return {};
}
