// The recovery-path audit found that the checkout-resume guard trusted
// workspace_subscriptions.stripe_status alone: the billing-cycle cron
// suspends workspaces.status directly, ahead of Stripe's own webhook
// updating stripe_status, so a workspace suspended in that window couldn't
// resume checkout even though it genuinely needed to. See needsCheckoutResume
// in lib/stripe/checkoutEligibility.ts, used by app/api/signup/checkout/route.ts.
import { describe, it, expect } from "vitest";
import { needsCheckoutResume } from "@/lib/stripe/checkoutEligibility";

describe("needsCheckoutResume", () => {
  it("blocks checkout when both the workspace and the subscription are genuinely active", () => {
    expect(needsCheckoutResume("active", "active")).toBe(false);
  });

  it("allows checkout when the workspace is suspended even if stripe_status still reads active (the cron-vs-webhook race)", () => {
    expect(needsCheckoutResume("suspended", "active")).toBe(true);
  });

  it("allows checkout when the workspace is active but the subscription is billing_incomplete", () => {
    expect(needsCheckoutResume("active", "incomplete")).toBe(true);
  });

  it("allows checkout when the workspace is suspended and the subscription is past_due", () => {
    expect(needsCheckoutResume("suspended", "past_due")).toBe(true);
  });
});
