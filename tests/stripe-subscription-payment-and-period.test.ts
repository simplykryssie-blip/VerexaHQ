// Two P1 bugs found auditing Settings -> Plans & Usage, both the same root
// cause class as the invoice.subscription schema-drift fix: current Stripe
// API versions moved billing-period dates off the top-level Subscription
// object onto its sole item, so handleSubscriptionCreated/Updated always
// wrote null current_period_start/end. Separately, card details were only
// ever captured by the standalone "Add a card" Setup Checkout flow, never
// by the subscription lifecycle itself, so every real signup showed "No
// card on file" despite Stripe holding a real default payment method on
// the subscription. See lib/stripe/subscriptionWebhooks.ts.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSetupCheckoutCompleted,
} from "@/lib/stripe/subscriptionWebhooks";
import type { createServiceClient } from "@/lib/supabase/service";

vi.mock("@/lib/stripe/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe/client")>();
  return {
    ...actual,
    retrieveCardDetails: vi.fn(),
    retrieveSetupIntentPaymentMethod: vi.fn(),
    setCustomerDefaultPaymentMethod: vi.fn(),
    updateSubscriptionItemPrice: vi.fn(),
  };
});

import { retrieveCardDetails, retrieveSetupIntentPaymentMethod, setCustomerDefaultPaymentMethod, updateSubscriptionItemPrice } from "@/lib/stripe/client";

const mockRetrieveCardDetails = vi.mocked(retrieveCardDetails);
const mockRetrieveSetupIntentPaymentMethod = vi.mocked(retrieveSetupIntentPaymentMethod);
const mockSetCustomerDefaultPaymentMethod = vi.mocked(setCustomerDefaultPaymentMethod);
const mockUpdateSubscriptionItemPrice = vi.mocked(updateSubscriptionItemPrice);

type MockConfig = {
  planByPriceId?: Record<string, Record<string, unknown>>;
  planBySlug?: Record<string, Record<string, unknown>>;
  planById?: Record<string, Record<string, unknown>>;
  existingSubscription?: Record<string, unknown> | null;
};

function createMockSupabase(config: MockConfig = {}) {
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const workspaceSubscriptionsUpdate = vi.fn().mockResolvedValue({ data: null, error: null });
  const workspacesUpdate = vi.fn().mockResolvedValue({ data: null, error: null });

  function from(table: string) {
    if (table === "platform_subscription_plans") {
      return {
        select: () => ({
          eq: (col: string, val: string) => ({
            maybeSingle: async () => ({
              data: (col === "stripe_price_id" ? config.planByPriceId?.[val] : config.planBySlug?.[val]) ?? null,
              error: null,
            }),
            single: async () => ({ data: (col === "id" ? config.planById?.[val] : null) ?? null, error: null }),
          }),
        }),
      };
    }
    if (table === "workspace_subscriptions") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: config.existingSubscription ?? null, error: null }),
          }),
        }),
        upsert,
        update: (payload: Record<string, unknown>) => {
          workspaceSubscriptionsUpdate(payload);
          return { eq: async () => ({ data: null, error: null }) };
        },
      };
    }
    if (table === "workspaces") {
      return {
        update: (payload: Record<string, unknown>) => {
          workspacesUpdate(payload);
          return {
            eq: () => ({
              eq: () => ({
                in: async () => ({ data: null, error: null }),
              }),
              in: async () => ({ data: null, error: null }),
              neq: async () => ({ data: null, error: null }),
            }),
          };
        },
      };
    }
    throw new Error(`Unexpected table in test mock: ${table}`);
  }

  const supabase = { from } as unknown as ReturnType<typeof createServiceClient>;
  return { supabase, upsert, workspaceSubscriptionsUpdate, workspacesUpdate };
}

const TEAM_PLAN = { id: "plan_team", slug: "team", stripe_price_id: "price_team_199", base_price_cents: 19900, per_seat_price_cents: 0, email_overage_rate_cents_per_1000: 100, storage_overage_rate_cents: 10, sms_overage_rate_cents: 5, currency: "usd" };

function subscriptionFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sub_test",
    customer: "cus_test",
    status: "active",
    default_payment_method: "pm_test",
    trial_end: null,
    cancel_at_period_end: false,
    metadata: { workspace_id: "ws_test", plan_slug: "team" },
    items: { data: [{ id: "si_test", price: { id: "price_team_199" }, current_period_start: 1700000000, current_period_end: 1702592000 }] },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleSubscriptionCreated -- billing period resolution", () => {
  it("populates current_period_start/end from the subscription's sole item", async () => {
    mockRetrieveCardDetails.mockResolvedValue({ ok: false, reason: "not used in this test" });
    const { supabase, upsert } = createMockSupabase({ planByPriceId: { price_team_199: TEAM_PLAN } });

    const result = await handleSubscriptionCreated(supabase, subscriptionFixture());

    expect(result).toEqual({});
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        current_period_start: new Date(1700000000 * 1000).toISOString(),
        current_period_end: new Date(1702592000 * 1000).toISOString(),
      }),
      { onConflict: "workspace_id" }
    );
  });

  it("fails closed to null dates when the item can't be resolved (no items), without crashing", async () => {
    mockRetrieveCardDetails.mockResolvedValue({ ok: false, reason: "not used in this test" });
    const { supabase, upsert } = createMockSupabase({ planByPriceId: { price_team_199: TEAM_PLAN }, planBySlug: { team: TEAM_PLAN } });

    const result = await handleSubscriptionCreated(supabase, subscriptionFixture({ items: { data: [] } }));

    expect(result).toEqual({});
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ current_period_start: null, current_period_end: null }), { onConflict: "workspace_id" });
  });

  it("fails closed to null dates when the subscription has multiple items, without crashing", async () => {
    mockRetrieveCardDetails.mockResolvedValue({ ok: false, reason: "not used in this test" });
    const { supabase, upsert } = createMockSupabase({ planBySlug: { team: TEAM_PLAN } });

    const result = await handleSubscriptionCreated(
      supabase,
      subscriptionFixture({
        items: {
          data: [
            { id: "si_a", price: { id: "price_team_199" }, current_period_start: 1700000000, current_period_end: 1702592000 },
            { id: "si_b", price: { id: "price_other" }, current_period_start: 1700000000, current_period_end: 1702592000 },
          ],
        },
      })
    );

    expect(result).toEqual({});
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ current_period_start: null, current_period_end: null }), { onConflict: "workspace_id" });
  });
});

describe("handleSubscriptionUpdated -- billing period resolution and renewal/price-migration", () => {
  it("detects a changed billing period (isNewCycle) and writes the new dates", async () => {
    mockRetrieveCardDetails.mockResolvedValue({ ok: false, reason: "not used in this test" });
    const { supabase, workspaceSubscriptionsUpdate } = createMockSupabase({
      existingSubscription: { id: "row_1", workspace_id: "ws_test", plan_id: "plan_team", current_period_end: new Date(1690000000 * 1000).toISOString(), price_change_effective_date: null },
    });

    const result = await handleSubscriptionUpdated(supabase, subscriptionFixture());

    expect(result).toEqual({});
    expect(workspaceSubscriptionsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        current_period_start: new Date(1700000000 * 1000).toISOString(),
        current_period_end: new Date(1702592000 * 1000).toISOString(),
      })
    );
  });

  it("applies a pending grandfathered price migration once its effective date is reached (renewal logic intact)", async () => {
    mockRetrieveCardDetails.mockResolvedValue({ ok: false, reason: "not used in this test" });
    mockUpdateSubscriptionItemPrice.mockResolvedValue({ ok: true, data: { id: "si_test" } });
    const { supabase, workspaceSubscriptionsUpdate } = createMockSupabase({
      existingSubscription: {
        id: "row_1",
        workspace_id: "ws_test",
        plan_id: "plan_team",
        current_period_end: new Date(1690000000 * 1000).toISOString(),
        // Effective date is before the new period's start (1700000000) -- migration should fire.
        price_change_effective_date: new Date(1695000000 * 1000).toISOString(),
      },
      planById: { plan_team: TEAM_PLAN },
    });

    const result = await handleSubscriptionUpdated(supabase, subscriptionFixture());

    expect(result).toEqual({});
    expect(mockUpdateSubscriptionItemPrice).toHaveBeenCalledWith({ subscriptionItemId: "si_test", priceId: "price_team_199" });
    expect(workspaceSubscriptionsUpdate).toHaveBeenCalledWith(expect.objectContaining({ price_change_effective_date: null, price_change_notice_sent_at: null }));
  });

  it("does not attempt a price migration when the new item's period can't be resolved (fails closed)", async () => {
    mockRetrieveCardDetails.mockResolvedValue({ ok: false, reason: "not used in this test" });
    const { supabase } = createMockSupabase({
      existingSubscription: {
        id: "row_1",
        workspace_id: "ws_test",
        plan_id: "plan_team",
        current_period_end: null,
        price_change_effective_date: new Date(1695000000 * 1000).toISOString(),
      },
      planById: { plan_team: TEAM_PLAN },
    });

    const result = await handleSubscriptionUpdated(supabase, subscriptionFixture({ items: { data: [] } }));

    expect(result).toEqual({});
    expect(mockUpdateSubscriptionItemPrice).not.toHaveBeenCalled();
  });
});

describe("subscription lifecycle -- payment method capture", () => {
  it("captures card details onto workspace_subscriptions when the subscription has a default payment method", async () => {
    mockRetrieveCardDetails.mockResolvedValue({ ok: true, data: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 } });
    const { supabase, upsert } = createMockSupabase({ planByPriceId: { price_team_199: TEAM_PLAN } });

    const result = await handleSubscriptionCreated(supabase, subscriptionFixture());

    expect(result).toEqual({});
    expect(mockRetrieveCardDetails).toHaveBeenCalledWith("pm_test");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ default_payment_method_id: "pm_test", card_brand: "visa", card_last4: "4242", card_exp_month: 12, card_exp_year: 2030 }),
      { onConflict: "workspace_id" }
    );
  });

  it("does not crash and writes no card fields when the subscription has no default payment method", async () => {
    const { supabase, upsert } = createMockSupabase({ planByPriceId: { price_team_199: TEAM_PLAN } });

    const result = await handleSubscriptionCreated(supabase, subscriptionFixture({ default_payment_method: null }));

    expect(result).toEqual({});
    expect(mockRetrieveCardDetails).not.toHaveBeenCalled();
    const upsertedPayload = upsert.mock.calls[0][0];
    expect(upsertedPayload).not.toHaveProperty("card_brand");
    expect(upsertedPayload).not.toHaveProperty("default_payment_method_id");
  });

  it("does not break subscription processing when card retrieval fails", async () => {
    mockRetrieveCardDetails.mockResolvedValue({ ok: false, reason: "Stripe responded with 404" });
    const { supabase, upsert } = createMockSupabase({ planByPriceId: { price_team_199: TEAM_PLAN } });

    const result = await handleSubscriptionCreated(supabase, subscriptionFixture());

    expect(result).toEqual({});
    const upsertedPayload = upsert.mock.calls[0][0];
    expect(upsertedPayload).not.toHaveProperty("card_brand");
    expect(upsertedPayload.plan_id).toBe("plan_team");
  });

  it("also captures card details on handleSubscriptionUpdated the same way", async () => {
    mockRetrieveCardDetails.mockResolvedValue({ ok: true, data: { brand: "mastercard", last4: "1234", expMonth: 6, expYear: 2029 } });
    const { supabase, workspaceSubscriptionsUpdate } = createMockSupabase({
      existingSubscription: { id: "row_1", workspace_id: "ws_test", plan_id: "plan_team", current_period_end: null, price_change_effective_date: null },
    });

    const result = await handleSubscriptionUpdated(supabase, subscriptionFixture());

    expect(result).toEqual({});
    expect(workspaceSubscriptionsUpdate).toHaveBeenCalledWith(expect.objectContaining({ card_brand: "mastercard", card_last4: "1234", default_payment_method_id: "pm_test" }));
  });
});

describe("handleSetupCheckoutCompleted -- unchanged by this fix", () => {
  it("still captures card details from the standalone Add-a-card Setup Checkout flow exactly as before", async () => {
    mockRetrieveSetupIntentPaymentMethod.mockResolvedValue({ ok: true, data: { paymentMethodId: "pm_from_setup" } });
    mockRetrieveCardDetails.mockResolvedValue({ ok: true, data: { brand: "amex", last4: "9999", expMonth: 3, expYear: 2031 } });
    mockSetCustomerDefaultPaymentMethod.mockResolvedValue({ ok: true, data: true });
    const { supabase, workspaceSubscriptionsUpdate } = createMockSupabase();

    const result = await handleSetupCheckoutCompleted(supabase, {
      id: "cs_test",
      customer: "cus_test",
      setup_intent: "seti_test",
      metadata: { workspace_id: "ws_test" },
    });

    expect(result).toEqual({});
    expect(mockSetCustomerDefaultPaymentMethod).toHaveBeenCalledWith({ customerId: "cus_test", paymentMethodId: "pm_from_setup" });
    expect(workspaceSubscriptionsUpdate).toHaveBeenCalledWith({
      default_payment_method_id: "pm_from_setup",
      card_brand: "amex",
      card_last4: "9999",
      card_exp_month: 3,
      card_exp_year: 2031,
    });
  });
});
