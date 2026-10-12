// Regression coverage for VEREXAHQ -- IA CONSOLIDATION (Assignments folded
// into Contacts). search_clients gained p_unassigned_only (migration
// 20261102000000_search_clients_unassigned_filter.sql) so the Assigned-to
// filter can offer a real, server-side "Unassigned" value rather than
// filtering only the currently-loaded page -- this must work identically
// for the normal paginated list and for ContactsBulkTable's "select all
// matching" cross-page reissue of the same query.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FixtureResult } from "./helpers/fakeSupabase";
import { WORKSPACE_FIXTURE } from "./fixtures/clientRecords";

const state = vi.hoisted(() => ({ supabase: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => state.supabase,
}));
vi.mock("@/lib/workspace", () => ({
  getCurrentWorkspace: () => Promise.resolve(WORKSPACE_FIXTURE),
}));

function setSupabase(tables: Record<string, FixtureResult> = {}, rpcs: Record<string, FixtureResult> = {}) {
  const fake = createFakeSupabase({ tables, rpcs });
  state.supabase = fake;
  return fake;
}

beforeEach(() => {
  vi.resetModules();
});

describe("/clients page -- Unassigned filter", () => {
  it("passes p_unassigned_only: true and omits p_assigned_staff_id when staff=unassigned", async () => {
    const fake = setSupabase({}, { search_clients: { data: [] } });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await ClientsPage({ searchParams: { staff: "unassigned" } });
    const call = fake.rpcCalls.find((c) => c.name === "search_clients");
    expect(call?.args?.p_unassigned_only).toBe(true);
    expect(call?.args?.p_assigned_staff_id).toBeUndefined();
  });

  it("passes p_assigned_staff_id and omits p_unassigned_only for a real staff id", async () => {
    const fake = setSupabase({}, { search_clients: { data: [] } });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await ClientsPage({ searchParams: { staff: "staff-1" } });
    const call = fake.rpcCalls.find((c) => c.name === "search_clients");
    expect(call?.args?.p_assigned_staff_id).toBe("staff-1");
    expect(call?.args?.p_unassigned_only).toBeUndefined();
  });

  it("omits both when no assignment filter is applied", async () => {
    const fake = setSupabase({}, { search_clients: { data: [] } });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await ClientsPage({ searchParams: {} });
    const call = fake.rpcCalls.find((c) => c.name === "search_clients");
    expect(call?.args?.p_assigned_staff_id).toBeUndefined();
    expect(call?.args?.p_unassigned_only).toBeUndefined();
  });

  it("combines the unassigned filter with other existing filters in one call", async () => {
    const fake = setSupabase({}, { search_clients: { data: [] } });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await ClientsPage({ searchParams: { staff: "unassigned", clientType: "business" } });
    const call = fake.rpcCalls.find((c) => c.name === "search_clients");
    expect(call?.args?.p_unassigned_only).toBe(true);
    expect(call?.args?.p_client_type).toBe("business");
  });

  it("loads without throwing when the unassigned filter matches nothing", async () => {
    setSupabase({}, { search_clients: { data: [] } });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await expect(ClientsPage({ searchParams: { staff: "unassigned" } })).resolves.toBeTruthy();
  });
});
