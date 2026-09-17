// P1: the app only enforced workspace.status === "suspended" -- archived
// and permanently_archived silently rendered the normal app shell. These
// tests cover the pure functions in lib/workspace.ts that now gate the full
// non-operational lifecycle (suspended/archived/permanently_archived). The
// live-Supabase side (is_workspace_operational already correctly allow-listed
// "active" before this change; create_client/create_engagement/pipeline_stages
// bypasses found and fixed by this same change) is covered by the P1
// report's disposable-workspace verification, since running that here would
// need SUPABASE_SERVICE_ROLE_KEY, which (like critical-paths.test.ts) this
// suite does not have in this environment.
import { describe, it, expect } from "vitest";
import { isNonOperationalWorkspaceStatus, isSuspensionRecoveryPath, workspaceOperationalError } from "@/lib/workspace";

describe("isNonOperationalWorkspaceStatus", () => {
  it("treats active as operational", () => {
    expect(isNonOperationalWorkspaceStatus("active")).toBe(false);
  });

  it("treats suspended, archived, and permanently_archived as non-operational", () => {
    expect(isNonOperationalWorkspaceStatus("suspended")).toBe(true);
    expect(isNonOperationalWorkspaceStatus("archived")).toBe(true);
    expect(isNonOperationalWorkspaceStatus("permanently_archived")).toBe(true);
  });
});

describe("workspaceOperationalError", () => {
  it("returns null for an active workspace", () => {
    expect(workspaceOperationalError({ status: "active" })).toBeNull();
  });

  it("returns a non-null error for suspended, archived, and permanently_archived", () => {
    expect(workspaceOperationalError({ status: "suspended" })).not.toBeNull();
    expect(workspaceOperationalError({ status: "archived" })).not.toBeNull();
    expect(workspaceOperationalError({ status: "permanently_archived" })).not.toBeNull();
  });

  it("gives distinct messaging per status rather than one generic string", () => {
    const suspended = workspaceOperationalError({ status: "suspended" });
    const archived = workspaceOperationalError({ status: "archived" });
    const permanentlyArchived = workspaceOperationalError({ status: "permanently_archived" });
    expect(new Set([suspended, archived, permanentlyArchived]).size).toBe(3);
  });
});

describe("isSuspensionRecoveryPath -- unchanged, reused for the full non-operational lifecycle", () => {
  it("allows the billing-recovery surface", () => {
    expect(isSuspensionRecoveryPath("/settings/plan-usage")).toBe(true);
    expect(isSuspensionRecoveryPath("/settings/plan-usage/card")).toBe(true);
    expect(isSuspensionRecoveryPath("/settings/profile")).toBe(true);
    expect(isSuspensionRecoveryPath("/support")).toBe(true);
    expect(isSuspensionRecoveryPath("/support/manage")).toBe(true);
  });

  it("blocks normal operational pages", () => {
    expect(isSuspensionRecoveryPath("/clients")).toBe(false);
    expect(isSuspensionRecoveryPath("/dashboard")).toBe(false);
    expect(isSuspensionRecoveryPath("/settings/billing")).toBe(false);
  });
});
