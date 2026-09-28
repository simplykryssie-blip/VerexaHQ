// Regression guard for the Contacts list Quick-View drawer's three
// previously-broken actions (VEREXAHQ -- CONTACTS EASY FIX #1): Current
// Engagement, Open Engagements, Next Appointment. All three destinations
// route through app/(app)/clients/[id]/ClientQuickViewDrawer.tsx, opened
// via the intercepting route when a row on /clients is clicked. These are
// pure functions extracted specifically so this behavior is testable
// without rendering the drawer or mocking next/navigation's useRouter,
// matching the existing project convention (see tests/dashboard-easy-fix-navigation.test.ts).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  currentEngagementHref,
  openEngagementsCount,
  nextAppointmentCalendarHref,
  fullRecordHref,
} from "@/app/(app)/clients/[id]/ClientQuickViewDrawer";

describe("currentEngagementHref", () => {
  it("A: links to the existing engagement detail route when one open engagement exists", () => {
    expect(currentEngagementHref([{ id: "eng-1", status: "New" }])).toBe("/engagements/eng-1");
  });

  it("B: with multiple open engagements, links to the first open one found", () => {
    expect(
      currentEngagementHref([
        { id: "eng-1", status: "New" },
        { id: "eng-2", status: "In Progress" },
      ])
    ).toBe("/engagements/eng-1");
  });

  it("C: returns undefined when every engagement is closed (Completed/Archived)", () => {
    expect(
      currentEngagementHref([
        { id: "eng-1", status: "Completed" },
        { id: "eng-2", status: "Archived" },
      ])
    ).toBeUndefined();
  });

  it("F: returns undefined for a contact with no engagements at all", () => {
    expect(currentEngagementHref([])).toBeUndefined();
  });

  it("skips a closed engagement to link to a later open one", () => {
    expect(
      currentEngagementHref([
        { id: "eng-closed", status: "Archived" },
        { id: "eng-open", status: "Waiting On Client" },
      ])
    ).toBe("/engagements/eng-open");
  });
});

describe("openEngagementsCount", () => {
  it("A: counts a single open engagement", () => {
    expect(openEngagementsCount([{ status: "New" }])).toBe(1);
  });

  it("B: counts multiple open engagements, ignoring closed ones mixed in", () => {
    expect(
      openEngagementsCount([{ status: "New" }, { status: "In Progress" }, { status: "Completed" }, { status: "Archived" }])
    ).toBe(2);
  });

  it("C: returns 0 when every engagement is closed", () => {
    expect(openEngagementsCount([{ status: "Completed" }, { status: "Archived" }])).toBe(0);
  });

  it("F: returns 0 for a contact with no engagements at all", () => {
    expect(openEngagementsCount([])).toBe(0);
  });
});

describe("nextAppointmentCalendarHref", () => {
  it("D: links to the existing Calendar route when a future appointment exists", () => {
    expect(nextAppointmentCalendarHref([{ id: "appt-1", start_at: "2027-01-01T10:00:00Z" }])).toBe("/calendar");
  });

  it("E/G: returns undefined for a contact with no appointments", () => {
    expect(nextAppointmentCalendarHref([])).toBeUndefined();
  });
});

// Contacts Reconciliation Audit -- Quick View gap #2. fullRecordHref is what
// every stat tile now navigates to instead of switching a local tab that
// rendered the full ClientTabsBody inline -- confirms the drawer always
// sends the user to the real, non-intercepted full page (see the function's
// own comment for why a real navigation, not router.push, is required) and
// that a requested tab actually round-trips into the URL ClientWorkspace
// reads on load.
describe("fullRecordHref", () => {
  it("links to the bare full record when no tab is requested", () => {
    expect(fullRecordHref("client-1")).toBe("/clients/client-1");
  });

  it("includes the requested tab as a query param", () => {
    expect(fullRecordHref("client-1", "Documents")).toBe("/clients/client-1?tab=Documents");
  });
});

// Contacts Reconciliation Audit -- Quick View gap #2 (the actual regression
// this task exists to fix): the drawer used to render the exact same
// ClientTabsBody the full page renders -- the complete, fully-editable
// Details/Tasks/Documents/Messages/Billing/Notes experience -- making it a
// second full record, not a quick view. This repo has no DOM renderer to
// assert against rendered output, so this asserts the only thing that
// actually matters at the source level: the drawer file must never import
// ClientTabsBody again. If a future change re-adds it, this test is the
// tripwire.
describe("ClientQuickViewDrawer does not duplicate the full record", () => {
  it("never renders <ClientTabsBody> (the full page's own fully-editable tab body) -- displayName/ClientTab are still fine to import from that module", () => {
    const source = readFileSync(join(__dirname, "../app/(app)/clients/[id]/ClientQuickViewDrawer.tsx"), "utf-8");
    expect(source).not.toMatch(/<ClientTabsBody\b/);
  });
});
