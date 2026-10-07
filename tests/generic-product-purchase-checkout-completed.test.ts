// Purchase + Payment Integration V1: handleFirmPackagePurchaseCheckoutCompleted
// is reused by both the connection-scoped firm-package checkout
// (/api/firm-packages/checkout) and the new generic client-direct product
// checkout (/api/products/checkout) -- both set the same
// metadata.type === "firm_package_purchase" and purchase_id. Before this
// change the handler silently skipped completing any purchase whose row
// had no connection_id, which would have left every client-direct purchase
// stuck in "pending" forever after a successful payment. This locks in the
// fix without touching the connection-based regression case (still exercised
// below).
import { describe, it, expect, vi } from "vitest";
import { handleFirmPackagePurchaseCheckoutCompleted } from "@/lib/stripe/handleFirmPackagePurchase";
import type { createServiceClient } from "@/lib/supabase/service";

const PURCHASE_ID = "33333333-3333-3333-3333-333333333333";
const PACKAGE_ID = "44444444-4444-4444-4444-444444444444";
const CONNECTION_ID = "55555555-5555-5555-5555-555555555555";

function createMockSupabase(purchaseRow: { id: string; package_id: string; connection_id: string | null } | null) {
  const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });
  const update = vi.fn(() => ({ eq: updateEq }));
  const maybeSingle = vi.fn().mockResolvedValue({ data: purchaseRow, error: null });
  const selectEq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: selectEq }));
  const from = vi.fn(() => ({ select, update }));
  const supabase = { from } as unknown as ReturnType<typeof createServiceClient>;
  return { supabase, from, select, selectEq, update, updateEq };
}

const baseSession = {
  id: "cs_test_123",
  customer: "cus_test_123",
  subscription: null,
  metadata: { type: "firm_package_purchase" as const, purchase_id: PURCHASE_ID },
};

describe("handleFirmPackagePurchaseCheckoutCompleted", () => {
  it("skips when metadata has no purchase_id", async () => {
    const { supabase, from } = createMockSupabase(null);
    const result = await handleFirmPackagePurchaseCheckoutCompleted(supabase, { ...baseSession, metadata: {} });
    expect(result).toEqual({ skipped: "missing purchase_id metadata" });
    expect(from).not.toHaveBeenCalled();
  });

  it("skips when the purchase row doesn't exist at all", async () => {
    const { supabase } = createMockSupabase(null);
    const result = await handleFirmPackagePurchaseCheckoutCompleted(supabase, baseSession);
    expect(result).toEqual({ skipped: "purchase not found" });
  });

  it("completes a connection-scoped purchase (the existing Firm Connection / Tax Avenue Pro-style path) and syncs firm_connections.package_id", async () => {
    const { supabase, update, updateEq } = createMockSupabase({ id: PURCHASE_ID, package_id: PACKAGE_ID, connection_id: CONNECTION_ID });
    const result = await handleFirmPackagePurchaseCheckoutCompleted(supabase, baseSession);
    expect(result).toEqual({ skipped: undefined });
    // Two updates: the purchase row itself, and the connection's package_id sync.
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
    expect(updateEq).toHaveBeenCalledWith("id", CONNECTION_ID);
  });

  it("completes a client-direct purchase (connection_id null) -- the generic Product-model checkout path -- without erroring or touching firm_connections", async () => {
    const { supabase, update, updateEq } = createMockSupabase({ id: PURCHASE_ID, package_id: PACKAGE_ID, connection_id: null });
    const result = await handleFirmPackagePurchaseCheckoutCompleted(supabase, baseSession);
    expect(result).toEqual({ skipped: undefined });
    // Only the purchase row itself is updated -- no connection to sync.
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
    expect(updateEq).not.toHaveBeenCalledWith("id", CONNECTION_ID);
  });
});
