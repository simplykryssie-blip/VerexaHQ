import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession } from "@/lib/stripe/client";
import { recordProviderCheck } from "@/lib/providerHealth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`checkout-session:${user.id}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const body = (await request.json()) as { invoiceId?: string; paymentPlanId?: string };
  const paymentPlanId = body.paymentPlanId;
  const invoiceId = body.invoiceId;
  if (!invoiceId && !paymentPlanId) {
    return NextResponse.json({ error: "invoiceId or paymentPlanId is required" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (paymentPlanId) {
    const { data: plan, error: planError } = await supabase
      .from("payment_plans")
      .select("id, workspace_id, amount, status, installment_number, invoices(invoice_number)")
      .eq("id", paymentPlanId)
      .single();
    if (planError || !plan) {
      return NextResponse.json({ error: planError?.message ?? "Installment not found" }, { status: 404 });
    }
    if (plan.status === "paid") {
      return NextResponse.json({ error: "This installment is already paid." }, { status: 400 });
    }

    const invoiceNumber = (plan.invoices as unknown as { invoice_number: string | null } | null)?.invoice_number ?? plan.id;
    const result = await createCheckoutSession({
      amount: plan.amount,
      description: `Invoice ${invoiceNumber} -- Installment ${plan.installment_number}`,
      successUrl: `${appUrl}/portal/billing?paid=1`,
      cancelUrl: `${appUrl}/portal/billing?paid=0`,
      metadata: { payment_plan_id: plan.id, workspace_id: plan.workspace_id },
    });

    if (!result.ok) {
      if (result.reason !== "Stripe is not configured for this environment.") {
        await recordProviderCheck("stripe", false, result.reason);
      }
      return NextResponse.json({ configured: false, reason: result.reason }, { status: 200 });
    }
    await recordProviderCheck("stripe", true);
    await supabase.from("payment_plans").update({ stripe_checkout_url: result.data.url }).eq("id", paymentPlanId);
    return NextResponse.json({ configured: true, url: result.data.url });
  }

  if (!invoiceId) {
    return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, workspace_id, invoice_number, total_amount, amount_paid")
    .eq("id", invoiceId)
    .single();
  if (invoiceError || !invoice) {
    return NextResponse.json({ error: invoiceError?.message ?? "Invoice not found" }, { status: 404 });
  }

  const balanceDue = invoice.total_amount - invoice.amount_paid;
  if (balanceDue <= 0) {
    return NextResponse.json({ error: "This invoice has no remaining balance." }, { status: 400 });
  }

  const result = await createCheckoutSession({
    amount: balanceDue,
    description: `Invoice ${invoice.invoice_number ?? invoice.id}`,
    successUrl: `${appUrl}/clients?paid=1`,
    cancelUrl: `${appUrl}/clients?paid=0`,
    metadata: { invoice_id: invoice.id, workspace_id: invoice.workspace_id },
  });

  if (!result.ok) {
    if (result.reason !== "Stripe is not configured for this environment.") {
      await recordProviderCheck("stripe", false, result.reason);
    }
    return NextResponse.json({ configured: false, reason: result.reason }, { status: 200 });
  }
  await recordProviderCheck("stripe", true);

  await supabase.from("invoices").update({ stripe_checkout_url: result.data.url }).eq("id", invoiceId!);

  return NextResponse.json({ configured: true, url: result.data.url });
}
