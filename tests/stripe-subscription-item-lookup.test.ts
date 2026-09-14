// getSoleSubscriptionItem replaced every items.data[0] positional
// assumption in the Stripe billing code (getSubscriptionPrimaryItemId,
// handleSubscriptionCreated's plan resolution, handleSubscriptionUpdated's
// price-migration branch) -- it must never silently pick "the first item"
// once a subscription ever has more than one.
import { describe, it, expect } from "vitest";
import { getSoleSubscriptionItem } from "@/lib/stripe/client";

describe("getSoleSubscriptionItem", () => {
  it("returns the sole item when exactly one exists (every subscription in production today)", () => {
    const result = getSoleSubscriptionItem([{ id: "si_only" }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ id: "si_only" });
  });

  it("fails safely with no items rather than returning undefined silently", () => {
    const result = getSoleSubscriptionItem([]);
    expect(result.ok).toBe(false);
  });

  it("fails safely (does not guess index 0) when multiple items exist", () => {
    const result = getSoleSubscriptionItem([{ id: "si_first" }, { id: "si_second" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/multiple items/i);
  });
});
