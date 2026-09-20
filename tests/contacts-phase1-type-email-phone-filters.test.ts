// Regression coverage for VEREXAHQ -- CONTACTS COMPLETION PASS, Phase 1
// (Client Type filter + Has-email/Has-phone toggles). search_clients already
// had a canonical clients.client_type column with no p_client_type
// parameter -- this only adds the RPC parameter and its filter UI, no
// schema change. "Account Type" was resolved as a duplicate of client_type
// (no other canonical field exists anywhere in the schema) and intentionally
// gets no filter of its own.
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

describe("/clients page -- Client Type filter", () => {
  it("passes p_client_type through to search_clients when the clientType search param is set", async () => {
    const fake = setSupabase({}, { search_clients: { data: [] } });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await ClientsPage({ searchParams: { clientType: "business" } });
    const call = fake.rpcCalls.find((c) => c.name === "search_clients");
    expect(call?.args?.p_client_type).toBe("business");
  });

  it("ignores an unrecognized clientType value rather than passing it through unchecked", async () => {
    const fake = setSupabase({}, { search_clients: { data: [] } });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await ClientsPage({ searchParams: { clientType: "not-a-real-type" } });
    const call = fake.rpcCalls.find((c) => c.name === "search_clients");
    expect(call?.args?.p_client_type).toBeUndefined();
  });

  it("omits p_client_type entirely when no filter is applied", async () => {
    const fake = setSupabase({}, { search_clients: { data: [] } });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await ClientsPage({ searchParams: {} });
    const call = fake.rpcCalls.find((c) => c.name === "search_clients");
    expect(call?.args?.p_client_type).toBeUndefined();
  });

  it("loads without throwing for every canonical client type value", async () => {
    for (const clientType of ["individual", "business", "trust", "estate", "organization"]) {
      setSupabase({}, { search_clients: { data: [] } });
      const { default: ClientsPage } = await import("@/app/(app)/clients/page");
      await expect(ClientsPage({ searchParams: { clientType } })).resolves.toBeTruthy();
    }
  });
});

describe("/clients page -- Has email / Has phone filters", () => {
  it("passes p_has_email: true for hasEmail=1", async () => {
    const fake = setSupabase({}, { search_clients: { data: [] } });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await ClientsPage({ searchParams: { hasEmail: "1" } });
    const call = fake.rpcCalls.find((c) => c.name === "search_clients");
    expect(call?.args?.p_has_email).toBe(true);
  });

  it("passes p_has_email: false for hasEmail=0 -- must not collapse to undefined like a naive boolean coercion would", async () => {
    const fake = setSupabase({}, { search_clients: { data: [] } });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await ClientsPage({ searchParams: { hasEmail: "0" } });
    const call = fake.rpcCalls.find((c) => c.name === "search_clients");
    expect(call?.args?.p_has_email).toBe(false);
  });

  it("omits p_has_email when unset", async () => {
    const fake = setSupabase({}, { search_clients: { data: [] } });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await ClientsPage({ searchParams: {} });
    const call = fake.rpcCalls.find((c) => c.name === "search_clients");
    expect(call?.args?.p_has_email).toBeUndefined();
  });

  it("passes p_has_phone: true/false symmetrically to p_has_email", async () => {
    const fakeTrue = setSupabase({}, { search_clients: { data: [] } });
    const { default: ClientsPageTrue } = await import("@/app/(app)/clients/page");
    await ClientsPageTrue({ searchParams: { hasPhone: "1" } });
    expect(fakeTrue.rpcCalls.find((c) => c.name === "search_clients")?.args?.p_has_phone).toBe(true);

    vi.resetModules();
    const fakeFalse = setSupabase({}, { search_clients: { data: [] } });
    const { default: ClientsPageFalse } = await import("@/app/(app)/clients/page");
    await ClientsPageFalse({ searchParams: { hasPhone: "0" } });
    expect(fakeFalse.rpcCalls.find((c) => c.name === "search_clients")?.args?.p_has_phone).toBe(false);
  });

  it("combines clientType, hasEmail, and hasPhone with existing filters (staff, missingDocs) in one call", async () => {
    const fake = setSupabase({}, { search_clients: { data: [] } });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await ClientsPage({
      searchParams: { clientType: "individual", hasEmail: "1", hasPhone: "0", staff: "staff-1", missingDocs: "1" },
    });
    const call = fake.rpcCalls.find((c) => c.name === "search_clients");
    expect(call?.args?.p_client_type).toBe("individual");
    expect(call?.args?.p_has_email).toBe(true);
    expect(call?.args?.p_has_phone).toBe(false);
    expect(call?.args?.p_assigned_staff_id).toBe("staff-1");
    expect(call?.args?.p_missing_documents).toBe(true);
  });

  it("loads without throwing for a no-results combination", async () => {
    setSupabase({}, { search_clients: { data: [] } });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await expect(
      ClientsPage({ searchParams: { clientType: "business", hasEmail: "0", hasPhone: "0" } })
    ).resolves.toBeTruthy();
  });
});
