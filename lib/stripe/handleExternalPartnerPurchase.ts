import { createServiceClient } from "@/lib/supabase/service";

// Stripe Checkout's own "Add custom field" feature on a Payment Link --
// configured once per link in the Stripe Dashboard, not a separate Verexa
// intake step. A session's custom_fields entries show up at this top-level
// array, never nested under customer_details (Stripe has no native
// business-name/individual-name split there).
const BUSINESS_NAME_CUSTOM_FIELD_KEY = "business_name";

type CheckoutSessionCustomField = {
  key: string;
  type: string;
  text?: { value?: string | null } | null;
};

type CheckoutSession = {
  id: string;
  payment_link?: string | null;
  payment_intent?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  customer?: string | { id: string } | null;
  customer_details?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  custom_fields?: CheckoutSessionCustomField[] | null;
};

function customerId(customer: CheckoutSession["customer"]): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

function customFieldValue(fields: CheckoutSessionCustomField[] | null | undefined, key: string): string | null {
  const field = fields?.find((f) => f.key === key);
  const value = field?.text?.value?.trim();
  return value ? value : null;
}

/**
 * A checkout completed through a workspace's OWN external Stripe Payment
 * Link (not Stripe Connect -- the workspace's Stripe account never has to
 * be connected to Verexa at all) that has been signature-verified against
 * that workspace's own registered secret (see
 * app/api/partner-purchase-webhook/[token]/route.ts). Resolves the
 * Verexa package via the session's payment_link id -- present directly on
 * every Payment-Link-originated checkout.session.completed payload, no
 * extra Stripe API call needed -- then hands off to
 * record_verified_partner_purchase, which owns buyer identity
 * (find_or_create_partner_prospect) and purchase/onboarding creation.
 */
export async function handleExternalPartnerPurchaseCheckoutCompleted(
  supabase: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  session: CheckoutSession
): Promise<{ skipped: string } | { didProcess: boolean; purchaseId: string | null }> {
  if (!session.payment_link) {
    return { skipped: "checkout session has no payment_link to match against a package" };
  }

  const { data: pkg } = await supabase
    .from("firm_packages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("stripe_payment_link_id", session.payment_link)
    .maybeSingle();

  if (!pkg) {
    return { skipped: `no package in this workspace is mapped to Payment Link ${session.payment_link}` };
  }

  if (!session.customer_details?.email) {
    return { skipped: "checkout session has no purchaser email to identify the buyer" };
  }

  const { data: result, error } = await supabase
    .rpc("record_verified_partner_purchase", {
      p_owning_workspace_id: workspaceId,
      p_package_id: pkg.id,
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
      // Explicit null (not undefined) so this key always reaches
      // PostgREST -- an omitted key can resolve to a different overload.
      // Optional per package: only populated when the Payment Link has a
      // custom field keyed "business_name" configured and the purchaser
      // filled it in.
      // The `as unknown as string | undefined` below is a type-only cast,
      // not a behavior change -- Supabase's generated Args type marks a
      // DEFAULT NULL param as optional but never nullable (a known
      // generator limitation, consistent across every such param in
      // lib/database.types.ts), so the real `null` this intentionally
      // sends (see the contract test in
      // partner-purchase-external-webhook.test.ts) doesn't type-check
      // against it even though it's exactly what the RPC expects.
      p_business_name: customFieldValue(session.custom_fields, BUSINESS_NAME_CUSTOM_FIELD_KEY) as unknown as string | undefined,
    })
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return { didProcess: Boolean(result?.did_process), purchaseId: result?.purchase_id ?? null };
}
