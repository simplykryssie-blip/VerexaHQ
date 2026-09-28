// Stripe moved an invoice's subscription reference from the flat
// `invoice.subscription` field to `invoice.parent.subscription_details.subscription`
// in newer API versions. Our LIVE webhook endpoint already receives the new
// shape -- confirmed via a real webhook_events.payload row where
// `subscription` was null but `parent.subscription_details.subscription` held
// the real id -- so handleInvoicePaymentSucceeded/handleInvoicePaymentFailed
// were silently treating every real subscription invoice as "not a
// subscription invoice" and skipping (dropping the invoice record and the
// one-time free usage allowance grant). See lib/stripe/subscriptionWebhooks.ts.
import { describe, it, expect, vi } from "vitest";
import { handleInvoicePaymentSucceeded, handleInvoicePaymentFailed } from "@/lib/stripe/subscriptionWebhooks";
import type { createServiceClient } from "@/lib/supabase/service";

type MockSupabaseOptions = {
  subscriptionRow?: { workspace_id: string } | null;
};

function createMockSupabase({ subscriptionRow = null }: MockSupabaseOptions = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: subscriptionRow, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn(() => ({ select, upsert }));
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

  const supabase = { from, rpc } as unknown as ReturnType<typeof createServiceClient>;
  return { supabase, from, select, eq, maybeSingle, upsert, rpc };
}

const newShapeInvoice = {
  id: "in_new_shape",
  subscription: null,
  parent: { subscription_details: { subscription: "sub_new_shape" } },
  amount_due: 100,
  amount_paid: 100,
  status: "paid",
  period_start: 1700000000,
  period_end: 1702592000,
  hosted_invoice_url: "https://invoice.stripe.com/in_new_shape",
};

const legacyShapeInvoice = {
  id: "in_legacy_shape",
  subscription: "sub_legacy_shape",
  amount_due: 9999,
  amount_paid: 9999,
  status: "paid",
  period_start: 1700000000,
  period_end: 1702592000,
  hosted_invoice_url: "https://invoice.stripe.com/in_legacy_shape",
};

const nonSubscriptionInvoice = {
  id: "in_no_subscription",
  subscription: null,
  parent: { subscription_details: null },
  amount_due: 500,
  amount_paid: 500,
  status: "paid",
  period_start: null,
  period_end: null,
  hosted_invoice_url: null,
};

describe("handleInvoicePaymentSucceeded -- subscription resolution", () => {
  it("Test 1: resolves via the current Stripe payload shape (parent.subscription_details.subscription)", async () => {
    const { supabase, eq, upsert, rpc } = createMockSupabase({ subscriptionRow: { workspace_id: "ws_new_shape" } });

    const result = await handleInvoicePaymentSucceeded(supabase, newShapeInvoice);

    expect(result).toEqual({});
    expect(eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_new_shape");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: "ws_new_shape", stripe_invoice_id: "in_new_shape" }), { onConflict: "stripe_invoice_id" });
    expect(rpc).toHaveBeenCalledWith("grant_workspace_usage_meters", { p_workspace_id: "ws_new_shape" });
  });

  it("Test 2: legacy flat invoice.subscription still resolves correctly", async () => {
    const { supabase, eq, upsert, rpc } = createMockSupabase({ subscriptionRow: { workspace_id: "ws_legacy" } });

    const result = await handleInvoicePaymentSucceeded(supabase, legacyShapeInvoice);

    expect(result).toEqual({});
    expect(eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_legacy_shape");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: "ws_legacy", stripe_invoice_id: "in_legacy_shape" }), { onConflict: "stripe_invoice_id" });
    expect(rpc).toHaveBeenCalledWith("grant_workspace_usage_meters", { p_workspace_id: "ws_legacy" });
  });

  it("Test 3: an invoice with no subscription reference in either location is skipped with no DB access", async () => {
    const { supabase, from } = createMockSupabase();

    const result = await handleInvoicePaymentSucceeded(supabase, nonSubscriptionInvoice);

    expect(result).toEqual({ skipped: "not a subscription invoice" });
    expect(from).not.toHaveBeenCalled();
  });

  it("Test 6: does not resolve the workspace via invoice/subscription metadata -- only via the workspace_subscriptions lookup", async () => {
    // parent.subscription_details.metadata below deliberately carries a
    // workspace_id that must NOT be used -- the fix must still go through
    // the existing stripe_subscription_id lookup (which here finds nothing),
    // not shortcut through metadata for workspace resolution.
    const invoiceWithMetadata = {
      ...newShapeInvoice,
      id: "in_with_metadata",
      parent: {
        subscription_details: {
          subscription: "sub_orphan",
          metadata: { workspace_id: "ws_should_never_be_used" },
        },
      },
    };
    const { supabase, eq, upsert, rpc } = createMockSupabase({ subscriptionRow: null });

    const result = await handleInvoicePaymentSucceeded(supabase, invoiceWithMetadata as typeof newShapeInvoice);

    expect(result).toEqual({ skipped: "no matching subscription" });
    expect(eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_orphan");
    expect(upsert).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("Test 5: processing the same invoice twice never issues anything but idempotent (upsert/ON CONFLICT DO NOTHING) operations", async () => {
    // claim_stripe_webhook_event (the route-level dedup) is what normally
    // stops this handler from ever running twice for the same event.id in
    // production. This test instead proves the handler's own DB operations
    // are idempotent-safe as defense in depth: both calls use upsert keyed
    // on stripe_invoice_id and the same ON-CONFLICT-DO-NOTHING RPC, so even
    // if it were ever invoked twice for the same invoice, Postgres (not
    // application logic) guarantees no duplicate row/grant -- a real DB
    // constraint check is out of scope for this mocked unit test.
    const { supabase, upsert, rpc } = createMockSupabase({ subscriptionRow: { workspace_id: "ws_dup" } });

    // The handler stamps paid_at with new Date().toISOString() at call time
    // (real, correct behavior -- it's recording when we processed the
    // payment). Freeze the clock for these two back-to-back calls so that
    // incidental field is deterministic too; without this the two calls can
    // straddle a millisecond boundary and produce different paid_at values,
    // failing the deep-equality check below on a field this test isn't
    // actually about.
    vi.useFakeTimers();
    let first: Awaited<ReturnType<typeof handleInvoicePaymentSucceeded>>;
    let second: Awaited<ReturnType<typeof handleInvoicePaymentSucceeded>>;
    try {
      first = await handleInvoicePaymentSucceeded(supabase, newShapeInvoice);
      second = await handleInvoicePaymentSucceeded(supabase, newShapeInvoice);
    } finally {
      vi.useRealTimers();
    }

    expect(first).toEqual({});
    expect(second).toEqual({});
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0]).toEqual(upsert.mock.calls[1]);
    expect(rpc).toHaveBeenCalledTimes(4); // 2x complete_sponsorship_transition_on_payment + 2x grant_workspace_usage_meters
    expect(rpc.mock.calls.filter(([name]) => name === "grant_workspace_usage_meters")).toEqual([
      ["grant_workspace_usage_meters", { p_workspace_id: "ws_dup" }],
      ["grant_workspace_usage_meters", { p_workspace_id: "ws_dup" }],
    ]);
  });
});

describe("handleInvoicePaymentFailed -- subscription resolution", () => {
  it("Test 4: resolves via the current Stripe payload shape and preserves existing failed-payment behavior", async () => {
    const { supabase, eq, upsert } = createMockSupabase({ subscriptionRow: { workspace_id: "ws_failed" } });

    const result = await handleInvoicePaymentFailed(supabase, newShapeInvoice);

    expect(result).toEqual({});
    expect(eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_new_shape");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: "ws_failed", stripe_invoice_id: "in_new_shape" }), { onConflict: "stripe_invoice_id" });
  });

  it("legacy flat invoice.subscription still resolves correctly for failed payments", async () => {
    const { supabase, eq, upsert } = createMockSupabase({ subscriptionRow: { workspace_id: "ws_failed_legacy" } });

    const result = await handleInvoicePaymentFailed(supabase, legacyShapeInvoice);

    expect(result).toEqual({});
    expect(eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_legacy_shape");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: "ws_failed_legacy" }), { onConflict: "stripe_invoice_id" });
  });

  it("a non-subscription invoice is skipped with no DB access", async () => {
    const { supabase, from } = createMockSupabase();

    const result = await handleInvoicePaymentFailed(supabase, nonSubscriptionInvoice);

    expect(result).toEqual({ skipped: "not a subscription invoice" });
    expect(from).not.toHaveBeenCalled();
  });
});
