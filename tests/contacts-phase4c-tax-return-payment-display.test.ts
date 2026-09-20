// Regression coverage for VEREXAHQ -- CONTACTS COMPLETION PASS, Phase 4c
// (tax-return payment tracking on the Client record). bank_product_transactions
// genuinely tracked refund transfer/advance status already, but only ever
// surfaced on the Engagement detail page. This is a read-only display added
// to the Client's Billing tab -- create/edit still only happens through the
// existing engagement-scoped BankProductTransactionForm/BankProductStatusSelect,
// so the underlying transaction system is not duplicated.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FixtureResult } from "./helpers/fakeSupabase";
import { WORKSPACE_FIXTURE, CLIENT_NO_RELATED_RECORDS } from "./fixtures/clientRecords";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const clientIdDir = join(dirname(fileURLToPath(import.meta.url)), "..", "app/(app)/clients/[id]");

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

describe("getClientWorkspaceData -- bankProductTransactions", () => {
  it("returns an empty array for a client with no engagements", async () => {
    setSupabase({ clients: { data: CLIENT_NO_RELATED_RECORDS } });
    const { getClientWorkspaceData } = await import("@/app/(app)/clients/[id]/getClientWorkspaceData");
    const result = await getClientWorkspaceData(CLIENT_NO_RELATED_RECORDS.id);
    expect(result?.bankProductTransactions).toEqual([]);
  });

  it("does not throw when an engagement exists and bank_product_transactions returns rows", async () => {
    setSupabase({
      clients: { data: CLIENT_NO_RELATED_RECORDS },
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
      bank_product_transactions: {
        data: [
          {
            id: "bpt-1",
            engagement_id: "engagement-1",
            bank_partner: "Republic Bank",
            product_type: "refund_transfer",
            status: "disbursed",
            disbursed_at: "2026-03-01T00:00:00Z",
            created_at: "2026-02-01T00:00:00Z",
            engagements: { engagement_number: "ENG-0001" },
          },
        ],
      },
    });
    const { getClientWorkspaceData } = await import("@/app/(app)/clients/[id]/getClientWorkspaceData");
    const result = await getClientWorkspaceData(CLIENT_NO_RELATED_RECORDS.id);
    expect(result).toBeTruthy();
    expect(Array.isArray(result?.bankProductTransactions)).toBe(true);
  });
});

describe("Client Billing tab -- bank product display source-level invariants", () => {
  const tabsSource = readFileSync(join(clientIdDir, "ClientWorkspaceTabs.tsx"), "utf8");
  const dataSource = readFileSync(join(clientIdDir, "getClientWorkspaceData.ts"), "utf8");

  it("is read-only -- no insert/update/delete against bank_product_transactions anywhere in the client detail view", () => {
    expect(tabsSource).not.toMatch(/bank_product_transactions.*\.insert\(/);
    expect(tabsSource).not.toMatch(/bank_product_transactions.*\.update\(/);
    expect(tabsSource).not.toMatch(/bank_product_transactions.*\.delete\(/);
  });

  it("fetches across every engagement this client has, not just one", () => {
    const body = dataSource.match(/if \(engagementIds\.length > 0\) \{[\s\S]*?bankProductTransactions = [\s\S]*?\n  \}/)?.[0] ?? "";
    expect(body).toMatch(/\.in\("engagement_id", engagementIds\)/);
  });

  it("links back to the source engagement rather than duplicating engagement-scoped fields", () => {
    expect(tabsSource).toMatch(/href=\{`\/engagements\/\$\{b\.engagement_id\}`\}/);
  });

  it("renders a status badge covering all 4 canonical statuses (pending/funded/disbursed/rejected)", () => {
    expect(tabsSource).toMatch(/BANK_PRODUCT_STATUS_TONE/);
    for (const status of ["pending", "funded", "disbursed", "rejected"]) {
      expect(tabsSource).toMatch(new RegExp(`${status}: "`));
    }
  });
});
