// isSubscriptionStatusPaid is the single gate handleSubscriptionCreated and
// handleSubscriptionUpdated both use before ever clearing billing_incomplete
// (create_paid_workspace's initial suspension lock on every brand-new paid
// signup) -- a subscription existing is not proof it was paid for, only its
// own status is. See lib/stripe/subscriptionWebhooks.ts.
import { describe, it, expect } from "vitest";
import { isSubscriptionStatusPaid } from "@/lib/stripe/subscriptionWebhooks";

describe("isSubscriptionStatusPaid", () => {
  it("treats active as paid", () => {
    expect(isSubscriptionStatusPaid("active")).toBe(true);
  });

  it("treats trialing as paid", () => {
    expect(isSubscriptionStatusPaid("trialing")).toBe(true);
  });

  it("does not treat incomplete as paid (a signup whose card hasn't confirmed yet)", () => {
    expect(isSubscriptionStatusPaid("incomplete")).toBe(false);
  });

  it("does not treat past_due as paid", () => {
    expect(isSubscriptionStatusPaid("past_due")).toBe(false);
  });

  it("does not treat unpaid as paid", () => {
    expect(isSubscriptionStatusPaid("unpaid")).toBe(false);
  });

  it("does not treat canceled as paid", () => {
    expect(isSubscriptionStatusPaid("canceled")).toBe(false);
  });
});
