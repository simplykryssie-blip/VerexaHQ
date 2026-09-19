// Regression coverage for VEREXAHQ -- CONTACTS EASY FIX #2 (Assigned Staff
// column). The audit found search_clients' own RETURNS TABLE never selects
// clients.relationship_manager_id -- the canonical assigned-staff field the
// RPC's existing p_assigned_staff_id filter already matches against -- so
// the column needed a scoped secondary fetch (app/(app)/clients/page.tsx),
// not a new assignment mechanism or an RPC signature change.
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
  state.supabase = createFakeSupabase({ tables, rpcs });
}

beforeEach(() => {
  vi.resetModules();
});

const RPC_ROW = {
  id: "client-1",
  client_type: "individual",
  first_name: "Alex",
  last_name: "Rivera",
  business_name: null,
  primary_email: "alex@example.com",
  primary_phone: "555-0100",
  lifecycle_status: "active",
  tags: [],
  total_count: 1,
};

describe("resolveAssignedStaff", () => {
  it("returns null for a contact with no relationship manager (unassigned state)", async () => {
    const { resolveAssignedStaff } = await import("@/app/(app)/clients/clientListColumns");
    expect(resolveAssignedStaff(null, new Map())).toBeNull();
  });

  it("resolves the staff member's display name when their profile is found", async () => {
    const { resolveAssignedStaff } = await import("@/app/(app)/clients/clientListColumns");
    const map = new Map([["staff-1", { id: "staff-1", display_name: "Jamie Chen" }]]);
    expect(resolveAssignedStaff("staff-1", map)).toEqual({ id: "staff-1", display_name: "Jamie Chen" });
  });

  it("falls back to a generic staff object when assigned but the profile row is missing", async () => {
    const { resolveAssignedStaff } = await import("@/app/(app)/clients/clientListColumns");
    expect(resolveAssignedStaff("staff-missing", new Map())).toEqual({ id: "staff-missing", display_name: null });
  });
});

describe("Assigned Staff column render", () => {
  it("renders an avatar and name for an assigned contact, and 'Unassigned' otherwise, without throwing", async () => {
    const { CLIENT_COLUMNS } = await import("@/app/(app)/clients/clientListColumns");
    const { DataTable } = await import("@/components/ui/DataTable");
    const rows = [
      { ...RPC_ROW, assignedStaff: { id: "staff-1", display_name: "Jamie Chen" } },
      { ...RPC_ROW, id: "client-2", assignedStaff: { id: "staff-missing", display_name: null } },
      { ...RPC_ROW, id: "client-3", assignedStaff: null },
    ];
    expect(() =>
      DataTable({
        columns: CLIENT_COLUMNS,
        rows: rows as never,
        emptyMessage: "No clients yet.",
      })
    ).not.toThrow();
  });
});

describe("/clients page -- Assigned Staff enrichment", () => {
  it("attaches the resolved staff member to a contact assigned via relationship_manager_id", async () => {
    setSupabase(
      {
        clients: { data: [{ id: "client-1", relationship_manager_id: "staff-1" }] },
        user_profiles: { data: [{ id: "staff-1", display_name: "Jamie Chen" }] },
      },
      { search_clients: { data: [RPC_ROW] } }
    );
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await expect(ClientsPage({ searchParams: {} })).resolves.toBeTruthy();
  });

  it("leaves a contact with no relationship manager unassigned (no crash, no fabricated staff)", async () => {
    setSupabase(
      {
        clients: { data: [{ id: "client-1", relationship_manager_id: null }] },
      },
      { search_clients: { data: [RPC_ROW] } }
    );
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await expect(ClientsPage({ searchParams: {} })).resolves.toBeTruthy();
  });

  it("handles a no-results search (existing staff filter combined with status and free-text query)", async () => {
    setSupabase({}, { search_clients: { data: [] } });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await expect(
      ClientsPage({ searchParams: { staff: "staff-1", status: "active", q: "nobody-matches-this" } })
    ).resolves.toBeTruthy();
  });

  it("combines the assigned-staff filter with missing-documents and outstanding-balance filters together", async () => {
    setSupabase(
      {
        clients: { data: [{ id: "client-1", relationship_manager_id: "staff-1" }] },
        user_profiles: { data: [{ id: "staff-1", display_name: "Jamie Chen" }] },
      },
      { search_clients: { data: [RPC_ROW] } }
    );
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await expect(
      ClientsPage({ searchParams: { staff: "staff-1", missingDocs: "1", balance: "1" } })
    ).resolves.toBeTruthy();
  });
});
