// Regression tests for VEREXAHQ EASY-FIX SWEEP #1 -- five Dashboard/client
// action links that either pointed at the wrong destination (Failed
// Automation Runs -> generic Workflows list, Request Documents -> generic
// Clients list) or did nothing at all (Current Engagement, Open Engagements,
// Next Appointment on the client detail/quick-view stat tiles).
//
// The "Failed Automation Runs -- header link" block that used to live here
// tested FailedAutomationRunsWidget's reportHref helper. That widget was
// removed from the Dashboard in the widget-consolidation pass (failed runs
// now surface via a count indicator on the Workflows list, linking to the
// existing /workflows/{id}?activity=1 Activity panel instead) -- there is no
// remaining dashboard header link for this test to cover.
import { describe, it, expect } from "vitest";
import { ACTIONS } from "@/components/widgets/QuickActionsWidget";
import { isOpenEngagementStatus, CLOSED_ENGAGEMENT_STATUSES } from "@/lib/engagementStatus";

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
