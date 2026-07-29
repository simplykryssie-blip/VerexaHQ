import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/serverAuth";
import { isStripeConfigured } from "@/lib/providerStatus";
import type Stripe from "stripe";

function unixToIso(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

export async function POST(req: NextRequest) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, reason: "Stripe webhook not configured." }, { status: 503 });
  }
  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    return NextResponse.json({ ok: false, reason: "Server billing credential not configured." }, { status: 503 });
  }
  const StripeSdk = (await import("stripe")).default;
  const stripe = new StripeSdk(process.env.STRIPE_SECRET_KEY as string);
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ ok: false, error: "Missing Stripe signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET as string);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Invalid webhook signature." }, { status: 400 });
  }

  const obj = event.data.object as unknown as Record<string, unknown>;

  // Idempotent record + claim, matching this schema's established Stripe
  // webhook processing contract (stripe_webhook_events / claim_stripe_
  // webhook_event / finalize_stripe_webhook_event). Never trust a
  // client-submitted status -- this route is the only writer, driven
  // entirely by Stripe's own signed event payload.
  await supabase.rpc("record_stripe_webhook_event", {
    p_stripe_event_id: event.id,
    p_event_type: event.type,
    p_livemode: event.livemode,
    p_api_version: event.api_version ?? null,
    p_object_id: typeof obj.id === "string" ? obj.id : null,
    p_customer_id: typeof obj.customer === "string" ? obj.customer : null,
    p_subscription_id:
      event.type.startsWith("customer.subscription.") && typeof obj.id === "string"
        ? obj.id
        : typeof obj.subscription === "string"
          ? obj.subscription
          : null,
    p_payment_intent_id: typeof obj.payment_intent === "string" ? obj.payment_intent : null,
    p_invoice_id: event.type.startsWith("invoice.") && typeof obj.id === "string" ? obj.id : null,
    p_received_payload: JSON.parse(JSON.stringify(event)) as unknown,
  });

  const { data: claim } = await supabase.rpc("claim_stripe_webhook_event", { p_stripe_event_id: event.id });
  if (!claim?.claimed) {
    // Already processed, or another delivery is in flight -- acknowledge
    // without reprocessing. This is the replay/duplicate-delivery guard.
    return NextResponse.json({ ok: true, received: true, skipped: true });
  }

  async function fail(message: string) {
    await supabase.rpc("mark_stripe_webhook_event_failed", { p_stripe_event_id: event.id, p_error_message: message.slice(0, 2000) });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = obj as unknown as Stripe.Subscription;
        const price = sub.items?.data?.[0]?.price;
        const { error } = await supabase.rpc("process_stripe_subscription_event", {
          p_stripe_event_id: event.id,
          p_stripe_event_type: event.type,
          p_stripe_subscription_id: sub.id,
          p_stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
          p_stripe_status: sub.status,
          p_stripe_price_id: price?.id ?? null,
          p_stripe_product_id: typeof price?.product === "string" ? price.product : null,
          p_current_period_start: unixToIso((sub as unknown as { current_period_start?: number }).current_period_start),
          p_current_period_end: unixToIso((sub as unknown as { current_period_end?: number }).current_period_end),
          p_cancel_at_period_end: sub.cancel_at_period_end ?? false,
          p_cancel_at: unixToIso(sub.cancel_at),
          p_canceled_at: unixToIso(sub.canceled_at),
          p_trial_start: unixToIso(sub.trial_start),
          p_trial_end: unixToIso(sub.trial_end),
          p_default_payment_method_id:
            typeof sub.default_payment_method === "string" ? sub.default_payment_method : (sub.default_payment_method?.id ?? null),
          p_latest_invoice_id: typeof sub.latest_invoice === "string" ? sub.latest_invoice : (sub.latest_invoice?.id ?? null),
          p_latest_payment_intent_id: null,
          p_subscription_payload: JSON.parse(JSON.stringify(sub)) as unknown,
        });
        if (error) await fail(error.message);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = obj as unknown as Stripe.Subscription;
        const { error } = await supabase.rpc("cancel_workspace_subscription_from_stripe", {
          p_stripe_event_id: event.id,
          p_stripe_event_type: event.type,
          p_stripe_subscription_id: sub.id,
          p_stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
          p_canceled_at: unixToIso(sub.canceled_at) ?? new Date().toISOString(),
          p_event_payload: JSON.parse(JSON.stringify(sub)) as unknown,
        });
        if (error) await fail(error.message);
        break;
      }
      case "checkout.session.completed": {
        const session = obj as unknown as Stripe.Checkout.Session;
        const invoiceId = session.metadata?.invoice_id;
        if (invoiceId) {
          // Legacy one-off invoice payment link flow -- unchanged.
          const amountPaid = Number(session.amount_total ?? 0) / 100;
          if (amountPaid > 0) {
            const { data: existing } = await supabase.from("invoice_payments").select("id").eq("external_transaction_id", event.id).maybeSingle();
            if (!existing) {
              const { data: invoice } = await supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
              if (invoice) {
                await supabase.from("invoice_payments").insert({
                  workspace_id: invoice.workspace_id,
                  invoice_id: invoiceId,
                  client_id: invoice.client_id,
                  payment_amount: amountPaid,
                  payment_status: "succeeded",
                  payment_method: "Stripe",
                  paid_at: new Date().toISOString(),
                  source_type: "provider_webhook",
                  external_transaction_id: event.id,
                });
                const newAmountPaid = Number(invoice.amount_paid) + amountPaid;
                await supabase
                  .from("invoices")
                  .update({
                    amount_paid: newAmountPaid,
                    invoice_status: newAmountPaid >= Number(invoice.total_amount) ? "paid" : "partial",
                    paid_at: newAmountPaid >= Number(invoice.total_amount) ? new Date().toISOString() : null,
                    external_provider_status: "paid",
                    external_last_synced_at: new Date().toISOString(),
                  })
                  .eq("id", invoiceId);
              }
            }
          }
          await supabase.rpc("mark_stripe_webhook_event_processed", {
            p_stripe_event_id: event.id,
            p_related_workspace_id: null,
            p_related_subscription_id: null,
            p_processing_summary: { action: "legacy_invoice_payment_link" },
          });
        } else if (session.mode === "setup") {
          // Update-payment-method flow: retrieve the attached payment
          // method's safe display fields and record them the same way a
          // payment_method.attached event would.
          const setupIntentId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id;
          if (setupIntentId) {
            const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
            const pmId = typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : setupIntent.payment_method?.id;
            if (pmId) {
              const pm = await stripe.paymentMethods.retrieve(pmId);
              const { error } = await supabase.rpc("process_stripe_payment_method_attached", {
                p_stripe_event_id: event.id,
                p_payment_method_id: pm.id,
                p_stripe_customer_id: typeof pm.customer === "string" ? pm.customer : (pm.customer?.id ?? null),
                p_card_funding_type: pm.card?.funding ?? null,
                p_card_brand: pm.card?.brand ?? null,
                p_card_last4: pm.card?.last4 ?? null,
              });
              if (error) await fail(error.message);
            } else {
              await fail("Setup session completed without an attached payment method.");
            }
          } else {
            await fail("Setup session completed without a setup intent.");
          }
        } else {
          const { error } = await supabase.rpc("process_stripe_checkout_session_completed", {
            p_stripe_event_id: event.id,
            p_stripe_checkout_session_id: session.id,
            p_stripe_customer_id: typeof session.customer === "string" ? session.customer : (session.customer?.id ?? ""),
            p_stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null),
          });
          if (error) await fail(error.message);
        }
        break;
      }
      case "invoice.paid": {
        const invoice = obj as unknown as Stripe.Invoice;
        const { error } = await supabase.rpc("process_stripe_invoice_paid", {
          p_stripe_event_id: event.id,
          p_stripe_invoice_id: invoice.id,
          p_payment_intent_id: typeof invoice.payment_intent === "string" ? invoice.payment_intent : (invoice.payment_intent?.id ?? null),
          p_amount_paid: Number(invoice.amount_paid ?? 0) / 100,
        });
        if (error) await fail(error.message);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = obj as unknown as Stripe.Invoice;
        const { error } = await supabase.rpc("process_stripe_invoice_payment_failed", {
          p_stripe_event_id: event.id,
          p_stripe_invoice_id: invoice.id,
          p_failure_message: (invoice as unknown as { last_finalization_error?: { message?: string } }).last_finalization_error?.message ?? "Payment failed.",
        });
        if (error) await fail(error.message);
        break;
      }
      case "payment_method.attached": {
        const pm = obj as unknown as Stripe.PaymentMethod;
        const { error } = await supabase.rpc("process_stripe_payment_method_attached", {
          p_stripe_event_id: event.id,
          p_payment_method_id: pm.id,
          p_stripe_customer_id: typeof pm.customer === "string" ? pm.customer : (pm.customer?.id ?? null),
          p_card_funding_type: pm.card?.funding ?? null,
          p_card_brand: pm.card?.brand ?? null,
          p_card_last4: pm.card?.last4 ?? null,
        });
        if (error) await fail(error.message);
        break;
      }
      case "setup_intent.succeeded": {
        const setupIntent = obj as unknown as Stripe.SetupIntent;
        const pmId = typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : setupIntent.payment_method?.id;
        if (pmId) {
          const pm = await stripe.paymentMethods.retrieve(pmId);
          const { error } = await supabase.rpc("process_stripe_payment_method_attached", {
            p_stripe_event_id: event.id,
            p_payment_method_id: pm.id,
            p_stripe_customer_id: typeof pm.customer === "string" ? pm.customer : (pm.customer?.id ?? null),
            p_card_funding_type: pm.card?.funding ?? null,
            p_card_brand: pm.card?.brand ?? null,
            p_card_last4: pm.card?.last4 ?? null,
          });
          if (error) await fail(error.message);
        } else {
          await supabase.rpc("mark_stripe_webhook_event_processed", {
            p_stripe_event_id: event.id,
            p_related_workspace_id: null,
            p_related_subscription_id: null,
            p_processing_summary: { action: "setup_intent_succeeded_no_payment_method" },
          });
        }
        break;
      }
      case "setup_intent.setup_failed": {
        const setupIntent = obj as unknown as Stripe.SetupIntent;
        await fail(setupIntent.last_setup_error?.message ?? "Card setup failed.");
        break;
      }
      case "customer.subscription.trial_will_end": {
        await supabase.rpc("mark_stripe_webhook_event_processed", {
          p_stripe_event_id: event.id,
          p_related_workspace_id: null,
          p_related_subscription_id: null,
          p_processing_summary: { action: "trial_will_end_acknowledged", note: "No notification channel wired yet." },
        });
        break;
      }
      default: {
        await supabase.rpc("mark_stripe_webhook_event_for_processing", { p_stripe_event_id: event.id });
      }
    }
  } catch (error) {
    await fail(error instanceof Error ? error.message : "Unexpected error processing Stripe event.");
  }

  return NextResponse.json({ ok: true, received: true });
}
