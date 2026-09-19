// Regression guard for the Contacts list Quick-View drawer's three
// previously-broken actions (VEREXAHQ -- CONTACTS EASY FIX #1): Current
// Engagement, Open Engagements, Next Appointment. All three destinations
// route through app/(app)/clients/[id]/ClientQuickViewDrawer.tsx, opened
// via the intercepting route when a row on /clients is clicked. These are
// pure functions extracted specifically so this behavior is testable
// without rendering the drawer or mocking next/navigation's useRouter,
// matching the existing project convention (see tests/dashboard-easy-fix-navigation.test.ts).
import { describe, it, expect } from "vitest";
import {
  currentEngagementHref,
  openEngagementsCount,
  nextAppointmentCalendarHref,
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
