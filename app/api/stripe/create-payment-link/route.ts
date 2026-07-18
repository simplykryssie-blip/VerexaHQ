import { NextRequest, NextResponse } from "next/server";
import { isStripeConfigured } from "@/lib/providerStatus";
import { authenticateRequest } from "@/lib/serverAuth";

export async function POST(req: NextRequest) {
  let supabase;
  try { ({ supabase } = await authenticateRequest(req)); } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const payload = await req.json().catch(() => null) as { invoiceId?: string } | null;
  const invoiceId = payload?.invoiceId?.trim();
  if (!invoiceId) return NextResponse.json({ ok: false, error: "Missing invoiceId." }, { status: 400 });
  if (!isStripeConfigured()) return NextResponse.json({ ok: false, reason: "Stripe is not configured." }, { status: 503 });

  const { data: rawInvoice, error: invoiceError } = await supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  const invoice = rawInvoice as any;
  if (invoiceError || !invoice) return NextResponse.json({ ok: false, error: "Invoice not found or access denied." }, { status: 404 });
  const { data: rawLineItems } = await supabase.from("invoice_line_items").select("*").eq("invoice_id", invoiceId);
  const lineItems = (rawLineItems ?? []) as any[];

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
    const balanceDue = Math.max(0, Number(invoice.total_amount) - Number(invoice.amount_paid));
    if (balanceDue <= 0) return NextResponse.json({ ok: false, error: "Invoice has no balance due." }, { status: 400 });
    const currency = String(invoice.currency || "usd").toLowerCase();
    const stripeItems = lineItems && lineItems.length > 0
      ? lineItems.filter((item: { line_total?: number }) => Number(item.line_total) > 0).map((item: { item_name?: string; line_total: number }) => ({
          price_data: { currency, product_data: { name: item.item_name || "Invoice item" }, unit_amount: Math.round(Number(item.line_total) * 100) }, quantity: 1,
        }))
      : [{ price_data: { currency, product_data: { name: invoice.invoice_number ? `Invoice ${invoice.invoice_number}` : "Invoice" }, unit_amount: Math.round(balanceDue * 100) }, quantity: 1 }];
    if (stripeItems.length === 0) return NextResponse.json({ ok: false, error: "Invoice has no payable items." }, { status: 400 });

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "");
    const paymentLink = await stripe.checkout.sessions.create({ mode: "payment", line_items: stripeItems, success_url: `${appUrl}/portal?payment=success`, cancel_url: `${appUrl}/portal?payment=canceled`, metadata: { invoice_id: invoiceId, workspace_id: String(invoice.workspace_id) } });
    const { error: updateError } = await supabase.from("invoices").update({ external_payment_url: paymentLink.url, external_checkout_id: paymentLink.id, external_provider_status: "link_created", external_last_synced_at: new Date().toISOString(), payment_collection_mode: "stripe" } as any).eq("id", invoiceId);
    if (updateError) return NextResponse.json({ ok: false, error: "Payment link created but invoice update was denied." }, { status: 409 });
    return NextResponse.json({ ok: true, url: paymentLink.url });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Payment link creation failed." }, { status: 500 });
  }
}
