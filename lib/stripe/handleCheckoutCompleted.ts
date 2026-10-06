import { createServiceClient } from "@/lib/supabase/service";

type CheckoutSession = {
  id: string;
  payment_intent: string;
  amount_total: number;
  metadata?: { invoice_id?: string; payment_plan_id?: string; workspace_id?: string; type?: string; resource_type?: string; units?: string };
};

/**
 * A workspace paying Verexa in advance for extra email/SMS/storage capacity
 * -- the platform-level counterpart to handleCheckoutSessionCompleted below
 * (which is a workspace's own client paying that workspace's invoice).
 * Credited only once Stripe confirms payment, never before, so nothing is
 * ever given out unpaid.
 */
export async function handleUsageTopupCheckoutCompleted(
  supabase: ReturnType<typeof createServiceClient>,
  session: CheckoutSession
): Promise<{ skipped: string } | { skipped: undefined }> {
  const workspaceId = session.metadata?.workspace_id;
  const resourceType = session.metadata?.resource_type;
  const units = session.metadata?.units ? Number(session.metadata.units) : undefined;

  if (!workspaceId || !resourceType || !units) {
    return { skipped: "missing usage top-up metadata" };
  }

  await supabase.rpc("credit_prepaid_balance", { p_workspace_id: workspaceId, p_resource_type: resourceType, p_units: units });

  // An SMS top-up may have just covered a paused phone number's monthly
  // fee -- reactivate immediately rather than waiting for tomorrow's cron.
  if (resourceType === "sms") {
    await supabase.rpc("bill_and_pause_phone_numbers", { p_workspace_id: workspaceId });
  }

  return { skipped: undefined };
}

/**
 * Shared by both the platform webhook and the Connect webhook, since a
 * Direct-charge checkout session completes the same way a platform-key one
 * does -- only which endpoint receives the event differs.
 */
export async function handleCheckoutSessionCompleted(
  supabase: ReturnType<typeof createServiceClient>,
  session: CheckoutSession
): Promise<{ skipped: string } | { skipped: undefined }> {
  const workspaceId = session.metadata?.workspace_id;
  let invoiceId = session.metadata?.invoice_id;
  const paymentPlanId = session.metadata?.payment_plan_id;

  if (!workspaceId || (!invoiceId && !paymentPlanId)) {
    return { skipped: "missing metadata" };
  }

  if (paymentPlanId) {
    const { data: plan } = await supabase.from("payment_plans").select("invoice_id").eq("id", paymentPlanId).single();
    if (!plan) {
      return { skipped: "payment plan not found" };
    }
    invoiceId = plan.invoice_id;
  }

  if (!invoiceId) {
    return { skipped: "no invoice reference" };
  }

  const { data: invoice } = await supabase.from("invoices").select("client_id, firm_connection_id").eq("id", invoiceId).single();
  if (!invoice) {
    return { skipped: "invoice not found" };
  }

  // Triggers apply_payment_to_invoice, which updates the invoice status
  // and posts the client_ledger entry, and payments_enqueue_receipt,
  // which emails the client a receipt -- no extra logic needed here.
  //
  // P12-01: a failed insert here must never be reported to Stripe as a
  // successfully processed webhook. Stripe has already charged the card by
  // this point, so silently swallowing an insert error would leave the
  // payment accepted by Stripe but permanently unrecorded in Verexa -- and
  // because the caller marks this webhook event 'processed' right after
  // this function returns, claim_stripe_webhook_event would never allow it
  // to be retried. A 23505 on uq_payments_stripe_checkout_session /
  // uq_payments_stripe_payment_intent means this exact session was already
  // recorded by an earlier attempt at this same event -- that's a retry
  // succeeding idempotently, not a new failure, so it resolves to the
  // existing row instead of throwing.
  let { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      workspace_id: workspaceId,
      client_id: invoice.client_id,
      firm_connection_id: invoice.firm_connection_id,
      invoice_id: invoiceId,
      amount: session.amount_total / 100,
      status: "succeeded",
      payment_method: "stripe",
      stripe_payment_intent_id: session.payment_intent,
      stripe_checkout_session_id: session.id,
    })
    .select("id")
    .single();

  if (paymentError) {
    if (paymentError.code === "23505") {
      const { data: existing } = await supabase.from("payments").select("id").eq("stripe_checkout_session_id", session.id).maybeSingle();
      if (!existing) {
        throw new Error(
          `Stripe payment insert conflict for invoice ${invoiceId} (checkout session ${session.id}) did not resolve to an existing row: ${paymentError.message}`
        );
      }
      payment = existing;
    } else {
      throw new Error(`Failed to record Stripe payment for invoice ${invoiceId} (checkout session ${session.id}): ${paymentError.message}`);
    }
  }

  if (paymentPlanId && payment) {
    await supabase.from("payment_plans").update({ status: "paid", paid_payment_id: payment.id }).eq("id", paymentPlanId);
  }

  return { skipped: undefined };
}

type FailedPaymentIntent = {
  id: string;
  amount: number;
  metadata?: { invoice_id?: string; payment_plan_id?: string; workspace_id?: string };
  last_payment_error?: { message?: string } | null;
};

/**
 * A card decline mid-checkout, not an abandoned session (that's
 * checkout.session.expired, which we don't currently listen for since an
 * abandoned session isn't itself informative -- the client can just retry).
 * Recorded the same way a success is, so the dashboard's payment-failures
 * tile and existing payment history both pick it up with no separate table.
 */
export async function handlePaymentIntentFailed(
  supabase: ReturnType<typeof createServiceClient>,
  intent: FailedPaymentIntent
): Promise<{ skipped: string } | { skipped: undefined }> {
  const workspaceId = intent.metadata?.workspace_id;
  let invoiceId = intent.metadata?.invoice_id;
  const paymentPlanId = intent.metadata?.payment_plan_id;

  if (!workspaceId || (!invoiceId && !paymentPlanId)) {
    return { skipped: "missing metadata" };
  }

  if (paymentPlanId && !invoiceId) {
    const { data: plan } = await supabase.from("payment_plans").select("invoice_id").eq("id", paymentPlanId).single();
    if (!plan) {
      return { skipped: "payment plan not found" };
    }
    invoiceId = plan.invoice_id;
  }

  if (!invoiceId) {
    return { skipped: "no invoice reference" };
  }

  const { data: invoice } = await supabase.from("invoices").select("client_id, firm_connection_id").eq("id", invoiceId).single();
  if (!invoice) {
    return { skipped: "invoice not found" };
  }

  await supabase.from("payments").insert({
    workspace_id: workspaceId,
    client_id: invoice.client_id,
    firm_connection_id: invoice.firm_connection_id,
    invoice_id: invoiceId,
    amount: intent.amount / 100,
    status: "failed",
    payment_method: "stripe",
    stripe_payment_intent_id: intent.id,
    notes: intent.last_payment_error?.message ?? null,
  });

  return { skipped: undefined };
}

export async function markWebhookProcessed(
  supabase: ReturnType<typeof createServiceClient>,
  webhookEventId: string | undefined,
  workspaceId: string | undefined
) {
  if (!webhookEventId) return;
  await supabase
    .from("webhook_events")
    .update({ status: "processed", processed_at: new Date().toISOString(), workspace_id: workspaceId ?? null })
    .eq("id", webhookEventId);
}

export async function markWebhookFailed(supabase: ReturnType<typeof createServiceClient>, webhookEventId: string | undefined, error: string) {
  if (!webhookEventId) return;
  await supabase
    .from("webhook_events")
    .update({ status: "failed", last_error: error, attempts: 1 })
    .eq("id", webhookEventId);
}
