// P12-01: handleCheckoutSessionCompleted previously destructured only `data`
// from the `payments` insert, never `error`. A failed insert (RLS denial,
// transient DB error, etc.) left `payment` null and the function still
// returned {skipped: undefined} -- its success signal. The webhook route
// then called markWebhookProcessed unconditionally, which marks the
// webhook_events row 'processed'. Since claim_stripe_webhook_event only
// allows should_process:true again for a 'failed' or stale 'received' row
// (never a 'processed' one), a silently-swallowed insert error meant the
// Stripe charge was accepted by Stripe but permanently unrecorded in
// Verexa, with no automatic path to ever retry it.
//
// This exercises the REAL exported handleCheckoutSessionCompleted against a
// hand-built fake Supabase client (the function takes its client as a
// parameter, so no module mock is needed) -- assertions are on what the
// function actually does (throws vs. returns, which tables/rows it
// touches), not on source text.
import { describe, it, expect } from "vitest";
import { handleCheckoutSessionCompleted } from "@/lib/stripe/handleCheckoutCompleted";

type Scenario = {
  paymentPlan?: { invoice_id: string } | null;
  invoice?: { client_id: string | null; firm_connection_id: string | null } | null;
  insertResult: { data: { id: string } | null; error: { message: string; code?: string } | null };
  existingPaymentBySessionId?: { id: string } | null;
};

function makeSupabase(scenario: Scenario) {
  const calls = {
    paymentsInsert: [] as unknown[],
    paymentsSelectBySession: 0,
    paymentPlanUpdates: [] as Array<{ status: string; paid_payment_id: string; planId: string }>,
  };

  const supabase = {
    from(table: string) {
      if (table === "payment_plans") {
        return {
          select: () => ({
            eq: (_col: string, _planId: string) => ({
              single: async () => ({ data: scenario.paymentPlan ?? null, error: null }),
            }),
          }),
          update: (payload: { status: string; paid_payment_id: string }) => ({
            eq: (_col: string, planId: string) => {
              calls.paymentPlanUpdates.push({ ...payload, planId });
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      if (table === "invoices") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: scenario.invoice ?? null, error: null }),
            }),
          }),
        };
      }
      if (table === "payments") {
        return {
          insert: (payload: unknown) => {
            calls.paymentsInsert.push(payload);
            return {
              select: () => ({
                single: async () => scenario.insertResult,
              }),
            };
          },
          select: () => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: async () => {
                calls.paymentsSelectBySession++;
                return { data: scenario.existingPaymentBySessionId ?? null, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  };

  return { supabase: supabase as never, calls };
}

const baseSession = {
  id: "cs_test_123",
  payment_intent: "pi_test_123",
  amount_total: 15000,
  metadata: { workspace_id: "ws-1", invoice_id: "inv-1" },
};

describe("handleCheckoutSessionCompleted -- Stripe payment insert error handling (P12-01)", () => {
  // 1 & 6. Normal successful Stripe payment persistence -- existing flow
  // keeps working exactly as before.
  it("records the payment and returns success when the insert succeeds", async () => {
    const { supabase, calls } = makeSupabase({
      invoice: { client_id: "client-1", firm_connection_id: null },
      insertResult: { data: { id: "payment-1" }, error: null },
    });

    const result = await handleCheckoutSessionCompleted(supabase, baseSession);

    expect(result).toEqual({ skipped: undefined });
    expect(calls.paymentsInsert).toHaveLength(1);
    expect(calls.paymentsInsert[0]).toMatchObject({
      workspace_id: "ws-1",
      client_id: "client-1",
      invoice_id: "inv-1",
      amount: 150,
      status: "succeeded",
      stripe_checkout_session_id: "cs_test_123",
      stripe_payment_intent_id: "pi_test_123",
    });
    expect(calls.paymentPlanUpdates).toEqual([]);
  });

  it("links the new payment to its payment plan when one is present", async () => {
    const { supabase, calls } = makeSupabase({
      paymentPlan: { invoice_id: "inv-1" },
      invoice: { client_id: "client-1", firm_connection_id: null },
      insertResult: { data: { id: "payment-1" }, error: null },
    });

    const result = await handleCheckoutSessionCompleted(supabase, {
      ...baseSession,
      metadata: { workspace_id: "ws-1", payment_plan_id: "plan-1" },
    });

    expect(result).toEqual({ skipped: undefined });
    expect(calls.paymentPlanUpdates).toEqual([{ status: "paid", paid_payment_id: "payment-1", planId: "plan-1" }]);
  });

  // 2 & 3. Stripe succeeded but the database insert fails -- this must
  // surface as a real failure, never a silent success.
  it("throws instead of reporting success when the payment insert fails for a real reason", async () => {
    const { supabase, calls } = makeSupabase({
      invoice: { client_id: "client-1", firm_connection_id: null },
      insertResult: { data: null, error: { message: "permission denied for table payments", code: "42501" } },
    });

    await expect(handleCheckoutSessionCompleted(supabase, baseSession)).rejects.toThrow(/Failed to record Stripe payment.*inv-1.*cs_test_123/);
    // The failure must be surfaced before any payment-plan state is touched.
    expect(calls.paymentPlanUpdates).toEqual([]);
  });

  it("does not update the payment plan when the insert fails, even if a plan was supplied", async () => {
    const { supabase, calls } = makeSupabase({
      paymentPlan: { invoice_id: "inv-1" },
      invoice: { client_id: "client-1", firm_connection_id: null },
      insertResult: { data: null, error: { message: "connection reset", code: "08006" } },
    });

    await expect(
      handleCheckoutSessionCompleted(supabase, { ...baseSession, metadata: { workspace_id: "ws-1", payment_plan_id: "plan-1" } })
    ).rejects.toThrow();
    expect(calls.paymentPlanUpdates).toEqual([]);
  });

  // 4. A retry does not create an unintended duplicate payment record.
  // uq_payments_stripe_checkout_session rejects a second insert for the
  // same session with 23505 -- that's the earlier attempt's row already
  // existing, not a new failure.
  it("resolves idempotently to the existing row on a unique-constraint conflict, without throwing", async () => {
    const { supabase, calls } = makeSupabase({
      invoice: { client_id: "client-1", firm_connection_id: null },
      insertResult: { data: null, error: { message: "duplicate key value violates unique constraint \"uq_payments_stripe_checkout_session\"", code: "23505" } },
      existingPaymentBySessionId: { id: "payment-already-recorded" },
    });

    const result = await handleCheckoutSessionCompleted(supabase, baseSession);

    expect(result).toEqual({ skipped: undefined });
    expect(calls.paymentsInsert).toHaveLength(1);
    expect(calls.paymentsSelectBySession).toBe(1);
  });

  it("links the payment plan to the pre-existing row on a retry conflict, not a second insert", async () => {
    const { supabase, calls } = makeSupabase({
      paymentPlan: { invoice_id: "inv-1" },
      invoice: { client_id: "client-1", firm_connection_id: null },
      insertResult: { data: null, error: { message: "duplicate key", code: "23505" } },
      existingPaymentBySessionId: { id: "payment-already-recorded" },
    });

    const result = await handleCheckoutSessionCompleted(supabase, {
      ...baseSession,
      metadata: { workspace_id: "ws-1", payment_plan_id: "plan-1" },
    });

    expect(result).toEqual({ skipped: undefined });
    expect(calls.paymentPlanUpdates).toEqual([{ status: "paid", paid_payment_id: "payment-already-recorded", planId: "plan-1" }]);
  });

  it("throws defensively if a 23505 conflict cannot be resolved to an existing row", async () => {
    const { supabase } = makeSupabase({
      invoice: { client_id: "client-1", firm_connection_id: null },
      insertResult: { data: null, error: { message: "duplicate key", code: "23505" } },
      existingPaymentBySessionId: null,
    });

    await expect(handleCheckoutSessionCompleted(supabase, baseSession)).rejects.toThrow(/did not resolve to an existing row/);
  });

  // 5. Unauthorized/cross-tenant access remains rejected: a payment can
  // only ever be recorded against a real invoice row, never from metadata
  // alone -- an invoice that doesn't resolve blocks the insert entirely.
  it("never attempts a payment insert when the referenced invoice does not exist", async () => {
    const { supabase, calls } = makeSupabase({
      invoice: null,
      insertResult: { data: { id: "should-not-be-used" }, error: null },
    });

    const result = await handleCheckoutSessionCompleted(supabase, baseSession);

    expect(result).toEqual({ skipped: "invoice not found" });
    expect(calls.paymentsInsert).toEqual([]);
  });

  it("never attempts a payment insert when required metadata is missing", async () => {
    const { supabase, calls } = makeSupabase({
      invoice: { client_id: "client-1", firm_connection_id: null },
      insertResult: { data: { id: "should-not-be-used" }, error: null },
    });

    const result = await handleCheckoutSessionCompleted(supabase, { ...baseSession, metadata: {} });

    expect(result).toEqual({ skipped: "missing metadata" });
    expect(calls.paymentsInsert).toEqual([]);
  });
});
