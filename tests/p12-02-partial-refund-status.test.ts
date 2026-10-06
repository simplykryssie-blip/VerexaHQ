// P12-02: /api/stripe/refund unconditionally set payments.status = "refunded"
// regardless of whether the issued refund covered the full payment amount,
// so a partial refund permanently marked the payment as fully refunded --
// hiding the remaining refundable balance and blocking any further refund
// of it (the route already refuses to act on a payment whose status is
// "refunded"). This proves the fix: the route now tracks refunded_amount,
// marks the payment "partially_refunded" when money remains, "refunded"
// only once the cumulative refunded amount reaches the original amount,
// rejects a refund request that exceeds what's actually left, and allows a
// second refund to finish off the remaining balance of a partially-refunded
// payment.
import { describe, expect, it, vi, beforeEach } from "vitest";

function base64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fakeAccessToken(payload: Record<string, unknown>): string {
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url(payload)}.fakesignature`;
}

const state = vi.hoisted(() => ({
  user: { id: "staff-1" } as { id: string } | null,
  canManageBilling: true,
  payment: null as Record<string, unknown> | null,
  invoice: null as Record<string, unknown> | null,
  lastLedgerEntry: null as { balance_after: number } | null,
  paymentsUpdatePayload: null as Record<string, unknown> | null,
  invoicesUpdatePayload: null as Record<string, unknown> | null,
  ledgerInsertPayload: null as Record<string, unknown> | null,
  refundResult: { ok: true, data: { id: "re_123" } } as { ok: boolean; data?: unknown; reason?: string },
  connectAccount: { ok: true, accountId: "acct_123" } as { ok: boolean; accountId?: string; reason?: string },
  stripeConfigured: true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: state.user } }),
      getSession: () =>
        Promise.resolve({ data: { session: { access_token: fakeAccessToken({ aal: "aal2", sub: "staff-1" }) } } }),
    },
    rpc: () => Promise.resolve({ data: state.canManageBilling, error: null }),
    from: (table: string) => {
      if (table === "payments") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: state.payment, error: state.payment ? null : { message: "not found" } }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: () => {
              state.paymentsUpdatePayload = payload;
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === "invoices") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: state.invoice, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: () => {
              state.invoicesUpdatePayload = payload;
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === "client_ledger") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: state.lastLedgerEntry, error: null }),
                }),
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => {
            state.ledgerInsertPayload = payload;
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

vi.mock("@/lib/stripe/client", () => ({
  createRefund: () => Promise.resolve(state.refundResult),
}));

vi.mock("@/lib/providerStatus", () => ({
  isStripeConfigured: () => state.stripeConfigured,
}));

vi.mock("@/lib/providerHealth", () => ({
  recordProviderCheck: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/stripe/workspaceConnect", () => ({
  getWorkspaceConnectAccount: () => Promise.resolve(state.connectAccount),
}));

function paymentFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    workspace_id: "ws-1",
    client_id: "client-1",
    invoice_id: null,
    amount: 1000,
    status: "succeeded",
    refunded_amount: 0,
    stripe_payment_intent_id: "pi_123",
    ...overrides,
  };
}

function request(body: unknown) {
  return new Request("https://app.example.test/api/stripe/refund", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  state.user = { id: "staff-1" };
  state.canManageBilling = true;
  state.payment = paymentFixture();
  state.invoice = null;
  state.lastLedgerEntry = null;
  state.paymentsUpdatePayload = null;
  state.invoicesUpdatePayload = null;
  state.ledgerInsertPayload = null;
  state.refundResult = { ok: true, data: { id: "re_123" } };
  state.connectAccount = { ok: true, accountId: "acct_123" };
  state.stripeConfigured = true;
});

describe("POST /api/stripe/refund -- partial refund status tracking (P12-02)", () => {
  it("marks the payment 'refunded' (not partially_refunded) on a full refund", async () => {
    state.payment = paymentFixture({ amount: 1000, refunded_amount: 0 });
    const { POST } = await import("@/app/api/stripe/refund/route");
    const res = await POST(request({ paymentId: "pay-1" }));
    expect(res.status).toBe(200);
    expect(state.paymentsUpdatePayload).toEqual({ status: "refunded", refunded_amount: 1000 });
  });

  it("marks the payment 'partially_refunded', not 'refunded', when the refund amount is less than the full amount", async () => {
    state.payment = paymentFixture({ amount: 1000, refunded_amount: 0 });
    const { POST } = await import("@/app/api/stripe/refund/route");
    const res = await POST(request({ paymentId: "pay-1", amount: 400 }));
    expect(res.status).toBe(200);
    expect(state.paymentsUpdatePayload).toEqual({ status: "partially_refunded", refunded_amount: 400 });
  });

  it("allows a second refund to finish off the remaining balance of an already partially-refunded payment, reaching 'refunded'", async () => {
    state.payment = paymentFixture({ amount: 1000, refunded_amount: 400, status: "partially_refunded" });
    const { POST } = await import("@/app/api/stripe/refund/route");
    const res = await POST(request({ paymentId: "pay-1", amount: 600 }));
    expect(res.status).toBe(200);
    expect(state.paymentsUpdatePayload).toEqual({ status: "refunded", refunded_amount: 1000 });
  });

  it("defaults to refunding exactly the remaining balance (not the original full amount) when no amount is supplied on an already partially-refunded payment", async () => {
    state.payment = paymentFixture({ amount: 1000, refunded_amount: 400, status: "partially_refunded" });
    const { POST } = await import("@/app/api/stripe/refund/route");
    const res = await POST(request({ paymentId: "pay-1" }));
    expect(res.status).toBe(200);
    expect(state.paymentsUpdatePayload).toEqual({ status: "refunded", refunded_amount: 1000 });
  });

  it("rejects a refund request for more than the remaining refundable balance", async () => {
    state.payment = paymentFixture({ amount: 1000, refunded_amount: 400, status: "partially_refunded" });
    const { POST } = await import("@/app/api/stripe/refund/route");
    const res = await POST(request({ paymentId: "pay-1", amount: 700 }));
    expect(res.status).toBe(400);
    expect(state.paymentsUpdatePayload).toBeNull();
  });

  it("rejects a zero or negative refund amount", async () => {
    state.payment = paymentFixture({ amount: 1000, refunded_amount: 0 });
    const { POST } = await import("@/app/api/stripe/refund/route");
    const res = await POST(request({ paymentId: "pay-1", amount: 0 }));
    expect(res.status).toBe(400);
    expect(state.paymentsUpdatePayload).toBeNull();
  });

  it("rejects refunding a payment that is already fully refunded, even if its status string were stale", async () => {
    state.payment = paymentFixture({ amount: 1000, refunded_amount: 1000, status: "refunded" });
    const { POST } = await import("@/app/api/stripe/refund/route");
    const res = await POST(request({ paymentId: "pay-1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already been fully refunded/i);
  });

  it("posts the client_ledger entry using the actual refunded amount, not the original payment amount", async () => {
    state.payment = paymentFixture({ amount: 1000, refunded_amount: 0, client_id: "client-1" });
    state.lastLedgerEntry = { balance_after: 0 };
    const { POST } = await import("@/app/api/stripe/refund/route");
    await POST(request({ paymentId: "pay-1", amount: 250 }));
    expect(state.ledgerInsertPayload).toMatchObject({ amount: 250, balance_after: 250 });
  });
});
