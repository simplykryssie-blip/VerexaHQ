// Purchase + Payment V1 reconciliation: /api/products/checkout (client-direct
// checkout against this workspace's own digital_product/service catalog) had
// two gaps the connection-scoped sibling route (/api/firm-packages/checkout)
// already closed: (1) no check that the selling/reselling workspace itself
// isn't suspended (Phase 4A -- getWorkspaceConnectAccount only verifies Stripe
// readiness, not operational status), and (2) no guard against a
// double-submitted "Buy" click creating two concurrent pending purchases for
// the same client+product (the sibling route has
// firm_package_purchases_active_per_connection; the new client-direct path had
// no equivalent). This proves both fixes, plus the existing happy path.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  workspace: { id: "ws-1", status: "active" } as { id: string; status: string } | null,
  rateLimitOk: true,
  product: null as Record<string, unknown> | null,
  client: null as Record<string, unknown> | null,
  sellerOperational: true,
  connectAccount: { ok: true, accountId: "acct_123" } as { ok: boolean; accountId?: string; reason?: string },
  stripeConfigured: true,
  insertError: null as { message: string } | null,
  insertedPurchase: null as Record<string, unknown> | null,
  checkoutResult: { ok: true, data: { id: "cs_123", url: "https://checkout.stripe.test/cs_123" } } as
    | { ok: true; data: { id: string; url: string } }
    | { ok: false; reason: string },
  rpcCalls: [] as { name: string; args: unknown }[],
}));

function builder(result: { data: unknown; error?: unknown }) {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    single: () => Promise.resolve({ data: result.data, error: result.error ?? null }),
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    rpc: (name: string, args: unknown) => {
      state.rpcCalls.push({ name, args });
      if (name === "is_workspace_operational") return Promise.resolve({ data: state.sellerOperational, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      if (table === "firm_packages") return builder({ data: state.product });
      if (table === "clients") return builder({ data: state.client });
      if (table === "firm_package_purchases") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve(
                  state.insertError ? { data: null, error: state.insertError } : { data: { id: "purchase-1" }, error: null }
                ),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: () => {
              state.insertedPurchase = patch;
              return Promise.resolve({ error: null });
            },
          }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

vi.mock("@/lib/workspace", () => ({
  getCurrentWorkspace: () => Promise.resolve(state.workspace),
  isWorkspaceStatusOperational: (status: string) => status === "active",
  workspaceOperationalError: () => "This workspace is suspended.",
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: () => Promise.resolve(state.rateLimitOk),
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

vi.mock("@/lib/stripe/client", () => ({
  createCheckoutSession: () => Promise.resolve(state.checkoutResult),
  createSubscriptionCheckoutSession: () => Promise.resolve(state.checkoutResult),
}));

vi.mock("@/lib/appUrl", () => ({
  getAppUrl: () => "https://app.example.test",
}));

function productFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "product-1",
    workspace_id: "ws-1",
    provider_workspace_id: null,
    name: "Tax Resolution Guide",
    product_type: "digital_product",
    flat_price: 199,
    billing_cadence: "one_time",
    status: "published",
    ...overrides,
  };
}

function request(body: unknown) {
  return new Request("https://app.example.test/api/products/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  state.workspace = { id: "ws-1", status: "active" };
  state.rateLimitOk = true;
  state.product = productFixture();
  state.client = { id: "client-1" };
  state.sellerOperational = true;
  state.connectAccount = { ok: true, accountId: "acct_123" };
  state.stripeConfigured = true;
  state.insertError = null;
  state.insertedPurchase = null;
  state.checkoutResult = { ok: true, data: { id: "cs_123", url: "https://checkout.stripe.test/cs_123" } };
  state.rpcCalls = [];
});

describe("POST /api/products/checkout -- Purchase + Payment V1 reconciliation", () => {
  it("starts checkout successfully for a published digital product sold directly to a client", async () => {
    const { POST } = await import("@/app/api/products/checkout/route");
    const res = await POST(request({ productId: "product-1", clientId: "client-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.url).toBe("https://checkout.stripe.test/cs_123");
  });

  it("checks the provider (seller) workspace's own operational status, not just the purchasing workspace's", async () => {
    const { POST } = await import("@/app/api/products/checkout/route");
    await POST(request({ productId: "product-1", clientId: "client-1" }));
    const call = state.rpcCalls.find((c) => c.name === "is_workspace_operational");
    expect(call?.args).toEqual({ p_workspace_id: "ws-1" });
  });

  it("checks the THIRD-PARTY provider workspace when the product is resold (provider_workspace_id set), not the reseller's own workspace", async () => {
    state.product = productFixture({ provider_workspace_id: "provider-ws-9" });
    const { POST } = await import("@/app/api/products/checkout/route");
    await POST(request({ productId: "product-1", clientId: "client-1" }));
    const call = state.rpcCalls.find((c) => c.name === "is_workspace_operational");
    expect(call?.args).toEqual({ p_workspace_id: "provider-ws-9" });
  });

  it("rejects checkout when the selling/providing workspace is suspended, even though the purchasing workspace is active", async () => {
    state.sellerOperational = false;
    const { POST } = await import("@/app/api/products/checkout/route");
    const res = await POST(request({ productId: "product-1", clientId: "client-1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/temporarily unavailable/i);
  });

  it("never reaches Stripe when the seller is suspended", async () => {
    state.sellerOperational = false;
    const { POST } = await import("@/app/api/products/checkout/route");
    await POST(request({ productId: "product-1", clientId: "client-1" }));
    expect(state.insertedPurchase).toBeNull();
  });

  it("maps the duplicate-pending-purchase constraint violation to a friendly error instead of the raw DB message", async () => {
    state.insertError = {
      message:
        'duplicate key value violates unique constraint "firm_package_purchases_active_per_client"',
    };
    const { POST } = await import("@/app/api/products/checkout/route");
    const res = await POST(request({ productId: "product-1", clientId: "client-1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("This client already has a purchase in progress or active for this product.");
  });

  it("passes through an unrelated insert error message unchanged", async () => {
    state.insertError = { message: "some other database error" };
    const { POST } = await import("@/app/api/products/checkout/route");
    const res = await POST(request({ productId: "product-1", clientId: "client-1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("some other database error");
  });
});
