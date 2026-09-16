// Verexa's Stripe account already has Stripe Tax active (business origin +
// tax-exclusive defaults configured), but nothing in the signup/resume
// Checkout Session request ever asked Stripe to actually calculate it, and
// nothing collected the customer's location to compute it against -- see
// the Stripe Tax audit. createSubscriptionCheckoutSessionFromPrice is
// shared by both /api/signup/checkout (payment-first signup) and
// /api/billing/resume-checkout (existing-customer recovery), so fixing it
// here covers both.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSubscriptionCheckoutSessionFromPrice } from "@/lib/stripe/client";

describe("createSubscriptionCheckoutSessionFromPrice -- Stripe Tax", () => {
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

  it("enables automatic tax and requires a billing address on the Checkout Session request", async () => {
    const result = await createSubscriptionCheckoutSessionFromPrice({
      priceId: "price_test_solo",
      successUrl: "https://app.example.com/dashboard?signup=complete",
      cancelUrl: "https://app.example.com/signup?checkout=cancelled",
      metadata: { type: "signup", pending_signup_id: "11111111-1111-1111-1111-111111111111", plan_slug: "solo" },
    });

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    const sentBody = init.body as URLSearchParams;
    expect(sentBody.get("automatic_tax[enabled]")).toBe("true");
    expect(sentBody.get("billing_address_collection")).toBe("required");
    // Unrelated to this change.
    expect(sentBody.get("mode")).toBe("subscription");
    expect(sentBody.get("managed_payments[enabled]")).toBe("false");
    expect(sentBody.get("metadata[pending_signup_id]")).toBe("11111111-1111-1111-1111-111111111111");
    expect(sentBody.get("subscription_data[metadata][pending_signup_id]")).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("fails safely without calling Stripe when not configured", async () => {
    delete process.env.STRIPE_SECRET_KEY;

    const result = await createSubscriptionCheckoutSessionFromPrice({
      priceId: "price_test_solo",
      successUrl: "https://app.example.com/x",
      cancelUrl: "https://app.example.com/y",
      metadata: {},
    });

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
