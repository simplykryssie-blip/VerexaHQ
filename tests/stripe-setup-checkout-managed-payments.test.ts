// The production Add Card button (Settings -> Plans & Usage) failed with
// Stripe's "Invalid mode: setup. Managed Payments... only supports
// mode: subscription or mode: payment" -- createSetupCheckoutSession never
// opted out of Managed Payments (the account's default), unlike
// createSubscriptionCheckoutSessionFromPrice and createUsageTopupCheckoutSession,
// which already disable it for their own (different) Managed Payments
// incompatibility. See lib/stripe/client.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSetupCheckoutSession } from "@/lib/stripe/client";

describe("createSetupCheckoutSession -- Managed Payments compatibility", () => {
  const originalSecretKey = process.env.STRIPE_SECRET_KEY;
  const originalAllowLiveSends = process.env.ALLOW_LIVE_SENDS_OUTSIDE_PRODUCTION;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.ALLOW_LIVE_SENDS_OUTSIDE_PRODUCTION = "true";
    fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "cs_test_123", url: "https://checkout.stripe.com/test" }), { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    process.env.STRIPE_SECRET_KEY = originalSecretKey;
    process.env.ALLOW_LIVE_SENDS_OUTSIDE_PRODUCTION = originalAllowLiveSends;
  });

  it("disables Managed Payments on the mode:setup Checkout Session request", async () => {
    const result = await createSetupCheckoutSession({
      customerId: "cus_test",
      successUrl: "https://app.example.com/settings/plan-usage?card=added",
      cancelUrl: "https://app.example.com/settings/plan-usage?card=cancelled",
      metadata: { workspace_id: "ws_test" },
    });

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    const sentBody = init.body as URLSearchParams;
    expect(sentBody.get("mode")).toBe("setup");
    expect(sentBody.get("managed_payments[enabled]")).toBe("false");
    // The rest of the request is unchanged by this fix.
    expect(sentBody.get("customer")).toBe("cus_test");
    expect(sentBody.get("payment_method_types[0]")).toBe("card");
    expect(sentBody.get("metadata[workspace_id]")).toBe("ws_test");
  });

  it("fails safely without calling Stripe when not configured", async () => {
    delete process.env.STRIPE_SECRET_KEY;

    const result = await createSetupCheckoutSession({
      customerId: "cus_test",
      successUrl: "https://app.example.com/x",
      cancelUrl: "https://app.example.com/y",
      metadata: {},
    });

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
