import { createServiceClient } from "@/lib/supabase/service";

type CheckoutSession = {
  id: string;
  payment_link?: string | null;
  payment_intent?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  customer?: string | { id: string } | null;
  customer_details?: { name?: string | null; email?: string | null; phone?: string | null } | null;
};

function customerId(customer: CheckoutSession["customer"]): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * A checkout completed through a workspace's own external Stripe Payment
 * Link for a one-time "digital product" purchase (e.g. the MKB $150
 * Customized Tax Refund Calculator) -- signature-verified against that
 * workspace's own registered secret (see
 * app/api/digital-product-webhook/[token]/route.ts). Resolves the digital
 * product via the session's payment_link id, then hands off to
 * record_verified_digital_product_purchase, which owns buyer identity
 * (find_or_create_public_lead -- a Contact Lead, never a Firm/Client/
 * Engagement/Partner) and purchase/pipeline creation.
 */
export async function handleDigitalProductPurchaseCheckoutCompleted(
  supabase: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  session: CheckoutSession
): Promise<{ skipped: string } | { didProcess: boolean; purchaseId: string | null }> {
  if (!session.payment_link) {
    return { skipped: "checkout session has no payment_link to match against a digital product" };
  }

  const { data: product } = await supabase
    .from("digital_products")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("stripe_payment_link_id", session.payment_link)
    .eq("status", "active")
    .maybeSingle();

  if (!product) {
    return { skipped: `no digital product in this workspace is mapped to Payment Link ${session.payment_link}` };
  }

  if (!session.customer_details?.email) {
    return { skipped: "checkout session has no purchaser email to identify the buyer" };
  }

  const { data: result, error } = await supabase
    .rpc("record_verified_digital_product_purchase", {
      p_owning_workspace_id: workspaceId,
      p_digital_product_id: product.id,
      p_purchaser_name: session.customer_details.name ?? "",
      p_purchaser_email: session.customer_details.email,
      p_purchaser_phone: session.customer_details.phone ?? "",
      p_amount: (session.amount_total ?? 0) / 100,
      p_currency: (session.currency ?? "usd").toLowerCase(),
      p_payment_provider: "stripe",
      p_payment_reference: session.id,
      p_external_payment_id: session.payment_intent ?? session.id,
      p_external_customer_id: customerId(session.customer) ?? undefined,
      p_external_checkout_session_id: session.id,
    })
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return { didProcess: Boolean(result?.did_process), purchaseId: result?.purchase_id ?? null };
}
