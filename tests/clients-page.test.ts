// Regression coverage for the real production crash on /clients
// (TypeError: Cannot read properties of undefined (reading '0'), traced via
// Vercel runtime logs to 2026-09-02) -- loads the Contacts list page and its
// row renderer under the exact conditions that class of bug hides in:
// a client with no related records at all, a client whose optional fields
// are null instead of populated, and a workspace with zero clients.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FixtureResult } from "./helpers/fakeSupabase";
import {
  WORKSPACE_FIXTURE,
  CLIENT_NO_RELATED_RECORDS,
  CLIENT_MISSING_OPTIONAL_FIELDS,
  CLIENT_WITH_PARTIAL_RELATIONS,
} from "./fixtures/clientRecords";

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

describe("/clients (Contacts) list page", () => {
  it("loads with a client that has no related records at all", async () => {
    setSupabase({
      clients: { data: [CLIENT_NO_RELATED_RECORDS], count: 1 },
    });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await expect(ClientsPage({ searchParams: {} })).resolves.toBeTruthy();
  });

  it("loads with a client whose optional fields are all null", async () => {
    setSupabase({
      clients: { data: [CLIENT_MISSING_OPTIONAL_FIELDS], count: 1 },
    });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await expect(ClientsPage({ searchParams: {} })).resolves.toBeTruthy();
  });

  it("loads with zero clients in the workspace (every list query empty)", async () => {
    setSupabase({
      clients: { data: [], count: 0 },
    });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await expect(ClientsPage({ searchParams: {} })).resolves.toBeTruthy();
  });

  it("loads filtered to a status with no matching clients", async () => {
    setSupabase({
      clients: { data: [], count: 0 },
    });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await expect(ClientsPage({ searchParams: { status: "archived" } })).resolves.toBeTruthy();
  });

  it("renders a table row for each fixture client without throwing", async () => {
    const { CLIENT_COLUMNS } = await import("@/app/(app)/clients/clientListColumns");
    const { DataTable } = await import("@/components/ui/DataTable");
    for (const client of [CLIENT_NO_RELATED_RECORDS, CLIENT_MISSING_OPTIONAL_FIELDS, CLIENT_WITH_PARTIAL_RELATIONS]) {
      const row = { ...client, requestedService: null, needsReview: false };
      expect(() =>
        DataTable({
          columns: CLIENT_COLUMNS,
          rows: [row as never],
          emptyMessage: "No clients yet.",
        })
      ).not.toThrow();
    }
  });
});
