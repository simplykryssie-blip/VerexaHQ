// Confirms chargeOffSession actually sends the Idempotency-Key header to
// Stripe when an idempotencyKey is supplied (as the dunning cron now does
// via dunningIdempotencyKey) -- the key existing in application code is
// only a real protection if it reaches the real HTTP request Stripe sees.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chargeOffSession } from "@/lib/stripe/client";
import { dunningIdempotencyKey } from "@/lib/billing/dunningIdempotency";

describe("chargeOffSession -- Idempotency-Key header", () => {
  const originalSecretKey = process.env.STRIPE_SECRET_KEY;
  const originalAllowLiveSends = process.env.ALLOW_LIVE_SENDS_OUTSIDE_PRODUCTION;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.ALLOW_LIVE_SENDS_OUTSIDE_PRODUCTION = "true";
    fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "pi_test_123", status: "succeeded" }), { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    process.env.STRIPE_SECRET_KEY = originalSecretKey;
    process.env.ALLOW_LIVE_SENDS_OUTSIDE_PRODUCTION = originalAllowLiveSends;
  });

  it("sends the dunning idempotency key as the Idempotency-Key header on the actual payment_intents request", async () => {
    const key = dunningIdempotencyKey("11111111-1111-1111-1111-111111111111", "2026-10-01T00:00:00.000Z");

    const result = await chargeOffSession({
      customerId: "cus_test",
      paymentMethodId: "pm_test",
      amountCents: 5900,
      description: "Verexa subscription -- cycle ending 2026-10-01",
      metadata: { workspace_id: "11111111-1111-1111-1111-111111111111", period_end: "2026-10-01" },
      idempotencyKey: key,
    });

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/payment_intents");
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("dunning:11111111-1111-1111-1111-111111111111:2026-10-01T00:00:00.000Z");
  });

  it("does not set an Idempotency-Key header when none is supplied (unrelated call sites are unaffected)", async () => {
    await chargeOffSession({
      customerId: "cus_test",
      paymentMethodId: "pm_test",
      amountCents: 5900,
      description: "some other charge",
      metadata: {},
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeUndefined();
  });

  it("produces the same key (and therefore the same header) across repeated calls for the same workspace and billing cycle", async () => {
    const key1 = dunningIdempotencyKey("11111111-1111-1111-1111-111111111111", "2026-10-01T00:00:00.000Z");
    await chargeOffSession({
      customerId: "cus_test",
      paymentMethodId: "pm_test",
      amountCents: 5900,
      description: "attempt 1",
      metadata: {},
      idempotencyKey: key1,
    });

    const key2 = dunningIdempotencyKey("11111111-1111-1111-1111-111111111111", "2026-10-01T00:00:00.000Z");
    await chargeOffSession({
      customerId: "cus_test",
      paymentMethodId: "pm_test",
      amountCents: 5900,
      description: "attempt 2 (a retried/overlapping cron tick)",
      metadata: {},
      idempotencyKey: key2,
    });

    const headers1 = (fetchSpy.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
    const headers2 = (fetchSpy.mock.calls[1] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers1["Idempotency-Key"]).toBe(headers2["Idempotency-Key"]);
  });
});
