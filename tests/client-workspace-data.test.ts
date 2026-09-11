// getClientWorkspaceData() feeds both the full client detail page AND the
// Quick-View drawer rendered through the @modal intercepted route -- the
// real crash traced to 2026-09-02 (see clients-page.test.ts) correlated
// with that parallel-route render, so this exercises the data loader itself
// under the same three conditions: no related records, null optional
// fields, and a partially-populated related record whose own joins
// (services, tax details) are missing.
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

describe("getClientWorkspaceData", () => {
  it("returns a full props shape for a client with no related records", async () => {
    setSupabase({
      clients: { data: CLIENT_NO_RELATED_RECORDS },
    });
    const { getClientWorkspaceData } = await import("@/app/(app)/clients/[id]/getClientWorkspaceData");
    const result = await getClientWorkspaceData(CLIENT_NO_RELATED_RECORDS.id);

    expect(result).toBeTruthy();
    expect(result?.contacts).toEqual([]);
    expect(result?.engagements).toEqual([]);
    expect(result?.outstandingBalance).toBe(0);
    expect(result?.leadPipelines).toEqual([]);
    expect(result?.automationStatus).toBeNull();
  });

  it("returns a full props shape for a client with null optional fields", async () => {
    setSupabase({
      clients: { data: CLIENT_MISSING_OPTIONAL_FIELDS },
    });
    const { getClientWorkspaceData } = await import("@/app/(app)/clients/[id]/getClientWorkspaceData");
    const result = await getClientWorkspaceData(CLIENT_MISSING_OPTIONAL_FIELDS.id);

    expect(result).toBeTruthy();
    expect(result?.client.tags).toBeNull();
    expect(result?.client.primary_email).toBeNull();
  });

  it("handles an engagement whose joined services/tax-detail relations are missing", async () => {
    setSupabase({
      clients: { data: CLIENT_WITH_PARTIAL_RELATIONS },
      engagements: {
        data: [
          {
            id: "engagement-1",
            engagement_number: "ENG-0001",
            status: "New",
            review_status: null,
            priority: null,
            due_date: null,
            open_date: "2026-08-01",
            completed_date: null,
            current_stage: null,
            services: null,
            engagement_tax_details: [],
            assigned_staff: null,
            reviewer: null,
            compliance_officer: null,
          },
        ],
      },
    });
    const { getClientWorkspaceData } = await import("@/app/(app)/clients/[id]/getClientWorkspaceData");
    const result = await getClientWorkspaceData(CLIENT_WITH_PARTIAL_RELATIONS.id);

    expect(result).toBeTruthy();
    expect(result?.engagements).toHaveLength(1);
  });

  it("returns null for a client id that no longer exists (e.g. a stale intercepted-route history entry)", async () => {
    setSupabase({
      clients: { data: null },
    });
    const { getClientWorkspaceData } = await import("@/app/(app)/clients/[id]/getClientWorkspaceData");
    await expect(getClientWorkspaceData("deleted-client-id")).resolves.toBeNull();
  });
});
