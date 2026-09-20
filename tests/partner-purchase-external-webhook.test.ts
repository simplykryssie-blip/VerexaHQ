// Verifies the missing app-layer piece for external Stripe Payment Link
// purchases: a completed checkout session must resolve to the RIGHT
// package for the RIGHT workspace (never another workspace's package with
// a similarly-shaped payment_link id), and must hand off to
// record_verified_partner_purchase (which already owns buyer identity and
// idempotency -- see the partner_purchase_stripe_mapping_and_purpose
// migration) with the fields Stripe actually gives a checkout.session.completed
// webhook.
import { describe, it, expect, vi } from "vitest";
import { handleExternalPartnerPurchaseCheckoutCompleted } from "@/lib/stripe/handleExternalPartnerPurchase";
import type { createServiceClient } from "@/lib/supabase/service";

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
const PACKAGE_ID = "22222222-2222-2222-2222-222222222222";

function createMockSupabase({ packageRow = null as { id: string } | null, rpcResult = null as unknown } = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: packageRow, error: null });
  const eq2 = vi.fn(() => ({ maybeSingle }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  const from = vi.fn(() => ({ select }));

  const rpcMaybeSingle = vi.fn().mockResolvedValue({ data: rpcResult, error: null });
  const rpc = vi.fn(() => ({ maybeSingle: rpcMaybeSingle }));

  const supabase = { from, rpc } as unknown as ReturnType<typeof createServiceClient>;
  return { supabase, from, select, eq1, eq2, rpc, rpcMaybeSingle };
}

const baseSession = {
  id: "cs_test_123",
  payment_link: "plink_abc123",
  payment_intent: "pi_test_123",
  amount_total: 49900,
  currency: "usd",
  customer: "cus_test_123",
  customer_details: { name: "Jane Prospect", email: "jane@example.com", phone: "+15551234567" },
};

describe("handleExternalPartnerPurchaseCheckoutCompleted", () => {
  it("skips when the checkout session has no payment_link", async () => {
    const { supabase, from } = createMockSupabase();
    const result = await handleExternalPartnerPurchaseCheckoutCompleted(supabase, WORKSPACE_ID, { ...baseSession, payment_link: null });
    expect(result).toEqual({ skipped: "checkout session has no payment_link to match against a package" });
    expect(from).not.toHaveBeenCalled();
  });

  it("skips when no package in THIS workspace is mapped to the payment_link -- proves tenant isolation, not just a missing row", async () => {
    const { supabase, eq1, eq2 } = createMockSupabase({ packageRow: null });
    const result = await handleExternalPartnerPurchaseCheckoutCompleted(supabase, WORKSPACE_ID, baseSession);
    expect(result).toHaveProperty("skipped");
    // Confirms the lookup was scoped to workspace_id before matching the payment_link,
    // so another workspace's package with the same payment_link id could never match.
    expect(eq1).toHaveBeenCalledWith("workspace_id", WORKSPACE_ID);
    expect(eq2).toHaveBeenCalledWith("stripe_payment_link_id", "plink_abc123");
  });

  it("skips when the session has no purchaser email -- buyer identity cannot be established", async () => {
    const { supabase } = createMockSupabase({ packageRow: { id: PACKAGE_ID } });
    const result = await handleExternalPartnerPurchaseCheckoutCompleted(supabase, WORKSPACE_ID, {
      ...baseSession,
      customer_details: { name: "Jane Prospect", email: null, phone: null },
    });
    expect(result).toEqual({ skipped: "checkout session has no purchaser email to identify the buyer" });
  });

  it("calls record_verified_partner_purchase with the resolved package and Stripe-provided purchaser/payment fields", async () => {
    const { supabase, rpc } = createMockSupabase({
      packageRow: { id: PACKAGE_ID },
      rpcResult: { did_process: true, purchase_id: "purchase-1", onboarding_id: "onboarding-1", partner_prospect_id: "prospect-1" },
    });

    const result = await handleExternalPartnerPurchaseCheckoutCompleted(supabase, WORKSPACE_ID, baseSession);

    expect(rpc).toHaveBeenCalledWith("record_verified_partner_purchase", {
      p_owning_workspace_id: WORKSPACE_ID,
      p_package_id: PACKAGE_ID,
      p_purchaser_name: "Jane Prospect",
      p_purchaser_email: "jane@example.com",
      p_purchaser_phone: "+15551234567",
      p_amount: 499,
      p_currency: "usd",
      p_payment_provider: "stripe",
      p_payment_reference: "cs_test_123",
      p_external_payment_id: "pi_test_123",
      p_external_customer_id: "cus_test_123",
      p_external_checkout_session_id: "cs_test_123",
    });
    expect(result).toEqual({ didProcess: true, purchaseId: "purchase-1" });
  });

  it("is idempotent for a duplicate webhook delivery -- did_process comes back false, no error thrown", async () => {
    const { supabase } = createMockSupabase({
      packageRow: { id: PACKAGE_ID },
      rpcResult: { did_process: false, purchase_id: "purchase-1", onboarding_id: "onboarding-1", partner_prospect_id: "prospect-1" },
    });

    const result = await handleExternalPartnerPurchaseCheckoutCompleted(supabase, WORKSPACE_ID, baseSession);
    expect(result).toEqual({ didProcess: false, purchaseId: "purchase-1" });
  });
});
