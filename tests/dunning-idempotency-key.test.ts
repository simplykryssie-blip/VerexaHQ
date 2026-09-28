// The pre-merge billing audit found the dunning cron's chargeOffSession
// call passed no Stripe idempotency key, relying solely on an
// application-level workspace_billing_charge_attempts check-then-act that
// is not atomic against two overlapping check-billing-cycles invocations --
// a real double-charge risk. dunningIdempotencyKey is the deterministic key
// now passed into chargeOffSession (app/api/cron/check-billing-cycles/route.ts)
// so Stripe itself becomes a second, atomic backstop.
import { describe, it, expect } from "vitest";
import { dunningIdempotencyKey } from "@/lib/billing/dunningIdempotency";

describe("dunningIdempotencyKey", () => {
  it("is deterministic for the same workspace and billing cycle", () => {
    const a = dunningIdempotencyKey("11111111-1111-1111-1111-111111111111", "2026-10-01T00:00:00.000Z");
    const b = dunningIdempotencyKey("11111111-1111-1111-1111-111111111111", "2026-10-01T00:00:00.000Z");
    expect(a).toBe(b);
  });

  it("changes when the billing cycle (current_period_end) changes", () => {
    const cycle1 = dunningIdempotencyKey("11111111-1111-1111-1111-111111111111", "2026-10-01T00:00:00.000Z");
    const cycle2 = dunningIdempotencyKey("11111111-1111-1111-1111-111111111111", "2026-11-01T00:00:00.000Z");
    expect(cycle1).not.toBe(cycle2);
  });

  it("changes when the workspace changes, even for the same period_end", () => {
    const ws1 = dunningIdempotencyKey("11111111-1111-1111-1111-111111111111", "2026-10-01T00:00:00.000Z");
    const ws2 = dunningIdempotencyKey("22222222-2222-2222-2222-222222222222", "2026-10-01T00:00:00.000Z");
    expect(ws1).not.toBe(ws2);
  });

  it("embeds the exact raw current_period_end value, not a reformatted date", () => {
    const key = dunningIdempotencyKey("11111111-1111-1111-1111-111111111111", "2026-10-01T00:00:00.000Z");
    expect(key).toBe("dunning:11111111-1111-1111-1111-111111111111:2026-10-01T00:00:00.000Z");
  });
});
