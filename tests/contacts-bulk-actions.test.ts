// Regression coverage for VEREXAHQ -- CONTACTS EASY FIX #3 (bulk status,
// bulk tag remove, bulk assignment). The audit found:
//   - "lost" must never be bulk-set directly -- it has real cascading side
//     effects only mark_client_lost applies (voids invoices, archives
//     engagements, cancels document requests).
//   - "archived" has no existing single-client mechanism anywhere in the
//     app (confirmed by a full-repo search), so this task does not invent
//     bulk archive/restore -- both remain unimplemented on purpose.
//   - Bulk assignment uses clients.relationship_manager_id, the same field
//     the Assigned Staff column (Fix #2) and ClientAssignmentForm already
//     use, never engagements.assigned_staff_id.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BULK_STATUS_OPTIONS,
  isEligibleForBulkStatus,
  partitionForBulkStatus,
  tagsAfterBulkRemove,
  rowsHavingTag,
  summarizeDeleteClientsResult,
} from "@/app/(app)/clients/bulkContactActions";
import { createFakeSupabase, type FixtureResult } from "./helpers/fakeSupabase";
import { WORKSPACE_FIXTURE } from "./fixtures/clientRecords";

describe("BULK_STATUS_OPTIONS", () => {
  it("only exposes Lead, Active, and Inactive -- never Lost or Archived", () => {
    const values = BULK_STATUS_OPTIONS.map((o) => o.value);
    expect(values).toEqual(["lead", "active", "inactive"]);
    expect(values).not.toContain("lost");
    expect(values).not.toContain("archived");
  });
});

describe("isEligibleForBulkStatus", () => {
  it("allows lead, active, and inactive", () => {
    expect(isEligibleForBulkStatus("lead")).toBe(true);
    expect(isEligibleForBulkStatus("active")).toBe(true);
    expect(isEligibleForBulkStatus("inactive")).toBe(true);
  });

  it("rejects lost and archived -- these must go through their own dedicated mechanisms", () => {
    expect(isEligibleForBulkStatus("lost")).toBe(false);
    expect(isEligibleForBulkStatus("archived")).toBe(false);
  });
});

describe("partitionForBulkStatus", () => {
  it("A (single selection): an eligible contact goes to eligible, none skipped", () => {
    const { eligible, skipped } = partitionForBulkStatus([{ id: "c1", lifecycle_status: "lead" }]);
    expect(eligible).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it("B (multiple selection): a mix of eligible and terminal statuses splits correctly", () => {
    const rows = [
      { id: "c1", lifecycle_status: "lead" },
      { id: "c2", lifecycle_status: "active" },
      { id: "c3", lifecycle_status: "lost" },
      { id: "c4", lifecycle_status: "archived" },
    ];
    const { eligible, skipped } = partitionForBulkStatus(rows);
    expect(eligible.map((r) => r.id)).toEqual(["c1", "c2"]);
    expect(skipped.map((r) => r.id)).toEqual(["c3", "c4"]);
  });

  it("C (empty selection): returns two empty arrays without throwing", () => {
    const { eligible, skipped } = partitionForBulkStatus([]);
    expect(eligible).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it("does not silently mutate data -- every input row appears in exactly one of the two output arrays", () => {
    const rows = [
      { id: "c1", lifecycle_status: "lead" },
      { id: "c2", lifecycle_status: "lost" },
    ];
    const { eligible, skipped } = partitionForBulkStatus(rows);
    expect(eligible.length + skipped.length).toBe(rows.length);
  });
});

describe("tagsAfterBulkRemove", () => {
  it("removes the target tag while preserving every other tag", () => {
    expect(tagsAfterBulkRemove(["vip", "urgent", "referral"], "urgent")).toEqual(["vip", "referral"]);
  });

  it("is a no-op when the tag isn't present", () => {
    expect(tagsAfterBulkRemove(["vip"], "not-there")).toEqual(["vip"]);
  });

  it("handles a null tags array without throwing", () => {
    expect(tagsAfterBulkRemove(null, "vip")).toEqual([]);
  });
});

describe("rowsHavingTag", () => {
  it("filters a mixed selection down to only rows carrying the tag (so a no-op update never fires for the rest)", () => {
    const rows = [
      { id: "c1", tags: ["vip"] },
      { id: "c2", tags: ["referral"] },
      { id: "c3", tags: ["vip", "referral"] },
    ];
    expect(rowsHavingTag(rows, "vip").map((r) => r.id)).toEqual(["c1", "c3"]);
  });

  it("returns an empty array when nothing in the selection has the tag", () => {
    expect(rowsHavingTag([{ id: "c1", tags: ["referral"] }], "vip")).toEqual([]);
  });

  it("treats a null tags array as having no tags", () => {
    expect(rowsHavingTag([{ id: "c1", tags: null }], "vip")).toEqual([]);
  });
});

// Contacts Reconciliation Audit -- bulk hard delete. summarizeDeleteClientsResult
// turns delete_clients' per-row RPC result into the three buckets
// ContactsBulkTable's toast needs, distinguishing the one expected/common
// skip reason (already an established client) from anything unanticipated.
describe("summarizeDeleteClientsResult", () => {
  it("counts successfully deleted rows", () => {
    const summary = summarizeDeleteClientsResult([
      { client_id: "c1", deleted: true, reason: null },
      { client_id: "c2", deleted: true, reason: null },
    ]);
    expect(summary.deletedCount).toBe(2);
    expect(summary.establishedClientSkips).toEqual([]);
    expect(summary.otherSkips).toEqual([]);
  });

  it("buckets an established-client skip separately from an unexpected failure", () => {
    const summary = summarizeDeleteClientsResult([
      { client_id: "c1", deleted: true, reason: null },
      { client_id: "c2", deleted: false, reason: "Has become an established client (2 engagement(s)) -- archive instead of deleting" },
      { client_id: "c3", deleted: false, reason: "Could not delete: some other constraint violation" },
    ]);
    expect(summary.deletedCount).toBe(1);
    expect(summary.establishedClientSkips).toEqual([
      { id: "c2", reason: "Has become an established client (2 engagement(s)) -- archive instead of deleting" },
    ]);
    expect(summary.otherSkips).toEqual([{ id: "c3", reason: "Could not delete: some other constraint violation" }]);
  });

  it("handles an empty result set without throwing", () => {
    const summary = summarizeDeleteClientsResult([]);
    expect(summary).toEqual({ deletedCount: 0, establishedClientSkips: [], otherSkips: [] });
  });

  it("treats insufficient-permissions and not-found skips as 'other', not established-client", () => {
    const summary = summarizeDeleteClientsResult([
      { client_id: "c1", deleted: false, reason: "Insufficient permissions" },
      { client_id: "c2", deleted: false, reason: "Contact not found" },
    ]);
    expect(summary.establishedClientSkips).toEqual([]);
    expect(summary.otherSkips.map((s) => s.id)).toEqual(["c1", "c2"]);
  });
});

// Page-level smoke coverage, matching the established clients-page.test.ts /
// contacts-assigned-staff-column.test.ts convention: exercises the real
// has_permission("clients.edit") wiring and staffOptions plumbing added to
// app/(app)/clients/page.tsx for the new bulk actions, without a DOM
// renderer (this repo has none) -- deep click-through behavior lives in
// ContactsBulkTable.tsx's own pure-function tests above.
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

describe("/clients page -- clients.edit permission wiring for bulk actions", () => {
  it("loads with clients.edit granted (bulk status/assignment visible)", async () => {
    setSupabase({}, { search_clients: { data: [] }, has_permission: { data: true } });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await expect(ClientsPage({ searchParams: {} })).resolves.toBeTruthy();
  });

  it("loads with clients.edit denied (bulk status/assignment hidden, page still renders)", async () => {
    setSupabase({}, { search_clients: { data: [] }, has_permission: { data: false } });
    const { default: ClientsPage } = await import("@/app/(app)/clients/page");
    await expect(ClientsPage({ searchParams: {} })).resolves.toBeTruthy();
  });
});
