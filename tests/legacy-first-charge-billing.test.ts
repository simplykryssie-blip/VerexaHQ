// isFirstPeriod is the single gate check-billing-cycles uses to recognize a
// subscription's stub period (created via createDelayedStartSubscription
// for a legacy customer migration with a future billing_cycle_anchor) and
// skip normal 7/3/1 pre-cycle charge attempts for it -- see
// app/api/cron/check-billing-cycles/route.ts.
import { describe, it, expect } from "vitest";
import { isFirstPeriod } from "@/lib/billing/firstPeriod";

describe("isFirstPeriod", () => {
  it("is false for an ordinary subscription with no first_period_end", () => {
    expect(isFirstPeriod({ first_period_end: null, current_period_end: "2026-11-01T00:00:00.000Z" })).toBe(false);
  });

  it("is true for a stub period whose current_period_end matches the stored anchor", () => {
    expect(isFirstPeriod({ first_period_end: "2026-10-01T00:00:00.000Z", current_period_end: "2026-10-01T00:00:00.000Z" })).toBe(true);
  });

  it("is false once current_period_end has advanced past the stored anchor (second cycle onward)", () => {
    expect(isFirstPeriod({ first_period_end: "2026-10-01T00:00:00.000Z", current_period_end: "2026-11-01T00:00:00.000Z" })).toBe(false);
  });

  it("is false when current_period_end is null (row excluded upstream by the cron's own query, but must not throw)", () => {
    expect(isFirstPeriod({ first_period_end: "2026-10-01T00:00:00.000Z", current_period_end: null })).toBe(false);
  });
});
