// Regression tests for VEREXAHQ EASY-FIX SWEEP #1 -- five Dashboard/client
// action links that either pointed at the wrong destination (Failed
// Automation Runs -> generic Workflows list, Request Documents -> generic
// Clients list) or did nothing at all (Current Engagement, Open Engagements,
// Next Appointment on the client detail/quick-view stat tiles).
import { describe, it, expect } from "vitest";
import { failedAutomationRunsReportHref } from "@/components/widgets/FailedAutomationRunsWidget";
import { ACTIONS } from "@/components/widgets/QuickActionsWidget";
import { isOpenEngagementStatus, CLOSED_ENGAGEMENT_STATUSES } from "@/lib/engagementStatus";
import type { FailedAutomationRunItem } from "@/lib/dashboard/data";

function failedRun(overrides: Partial<FailedAutomationRunItem> = {}): FailedAutomationRunItem {
  return {
    id: "run-1",
    automation_id: "automation-1",
    automation_name: "Test Automation",
    completed_at: "2026-09-01T00:00:00.000Z",
    error_message: null,
    ...overrides,
  };
}

describe("Failed Automation Runs -- header link", () => {
  it("points at the most recent failed run's own automation activity view, not the generic Workflows list", () => {
    const href = failedAutomationRunsReportHref([failedRun({ automation_id: "automation-abc" })]);
    expect(href).toBe("/workflows/automation-abc?activity=1");
  });

  it("uses the first (most recent) item when several different automations have failed", () => {
    const href = failedAutomationRunsReportHref([
      failedRun({ id: "run-1", automation_id: "automation-newest" }),
      failedRun({ id: "run-2", automation_id: "automation-older" }),
    ]);
    expect(href).toBe("/workflows/automation-newest?activity=1");
  });

  it("is undefined when there are zero failed runs, so the header link disappears instead of pointing anywhere", () => {
    expect(failedAutomationRunsReportHref([])).toBeUndefined();
  });

  it("never produces a URL with an undefined/missing automation id", () => {
    const href = failedAutomationRunsReportHref([failedRun({ automation_id: "automation-xyz" })]);
    expect(href).not.toContain("undefined");
    expect(href).not.toContain("null");
  });
});

describe("Request Documents quick action", () => {
  it("points at the Document Center (canonical document-request destination), not the generic Clients list", () => {
    const action = ACTIONS.find((a) => a.label === "Request Documents");
    expect(action?.href).toBe("/documents");
  });

  it("leaves the other quick actions' destinations unchanged", () => {
    const byLabel = Object.fromEntries(ACTIONS.map((a) => [a.label, a.href]));
    expect(byLabel["New Client"]).toBe("/clients");
    expect(byLabel["New Engagement"]).toBe("/engagements/new");
    expect(byLabel["Create Invoice"]).toBe("/clients");
    expect(byLabel["Schedule Appointment"]).toBe("/calendar");
    expect(byLabel["Invite Staff"]).toBe("/settings/users");
  });
});

describe("Open Engagements / Current Engagement -- shared status predicate", () => {
  it("treats every non-terminal status as open", () => {
    expect(isOpenEngagementStatus("New")).toBe(true);
    expect(isOpenEngagementStatus("In Progress")).toBe(true);
    expect(isOpenEngagementStatus("Waiting On Payment")).toBe(true);
  });

  it("treats Completed and Archived as not open", () => {
    expect(isOpenEngagementStatus("Completed")).toBe(false);
    expect(isOpenEngagementStatus("Archived")).toBe(false);
  });

  it("CLOSED_ENGAGEMENT_STATUSES is exactly what isOpenEngagementStatus excludes (single source of truth for the Dashboard KPI, the Engagements ?status=open filter, and the client stat tiles)", () => {
    for (const status of CLOSED_ENGAGEMENT_STATUSES) {
      expect(isOpenEngagementStatus(status)).toBe(false);
    }
    expect(isOpenEngagementStatus("Ready To Release")).toBe(true);
  });

  it("produces zero open engagements (not a broken filter) when every engagement is closed", () => {
    const engagements = [{ status: "Completed" }, { status: "Archived" }];
    const open = engagements.filter((e) => isOpenEngagementStatus(e.status));
    expect(open).toHaveLength(0);
  });
});
