// Dashboard consolidation pass (originally authored on the un-merged
// claude/verexa-remove-services-vaqbfx branch as 7a2d373/a54bded, cherry-
// picked here since it was real, wanted, already-built work that had never
// reached main): four widget types were retired by absorption into a
// sibling ('kpis' -> "Engagements", 'calendar' -> "Today",
// 'missing_documents' -> "Client Requests", 'engagement_pipeline' now also
// carries the former Stage Breakdown donut) and 'failed_automations' moved
// off the dashboard entirely. Retirement must stay app-side-only: existing
// dashboard_widgets/user_widget_preferences rows for the four retired types
// are never deleted, so WidgetType must keep accepting them even though
// they're no longer implemented or rendered.
import { describe, it, expect } from "vitest";
import { IMPLEMENTED_WIDGET_TYPES, WIDGET_SECTIONS, WIDE_WIDGET_TYPES, isWidgetType, type WidgetType } from "@/lib/dashboard/widgets";

const RETIRED_TYPES = ["unassigned_engagements", "overdue_requests", "stage_breakdown", "failed_automations"] as const;

describe("dashboard widget consolidation", () => {
  it("no longer implements the four retired widget types", () => {
    for (const type of RETIRED_TYPES) {
      expect(IMPLEMENTED_WIDGET_TYPES).not.toContain(type);
      expect(isWidgetType(type)).toBe(false);
    }
  });

  it("still accepts the retired types as a valid WidgetType (compile-time only -- existing rows must not become invalid)", () => {
    const stillTypesafe: WidgetType[] = [...RETIRED_TYPES];
    expect(stillTypesafe).toHaveLength(4);
  });

  it("every section only lists implemented types, so a retired type can never render as a section member", () => {
    for (const section of WIDGET_SECTIONS) {
      for (const type of section.types) {
        expect(IMPLEMENTED_WIDGET_TYPES).toContain(type);
      }
    }
  });

  it("every implemented type belongs to exactly one section", () => {
    const allSectioned = WIDGET_SECTIONS.flatMap((s) => s.types);
    for (const type of IMPLEMENTED_WIDGET_TYPES) {
      expect(allSectioned.filter((t) => t === type)).toHaveLength(1);
    }
  });

  it("WIDE_WIDGET_TYPES only contains implemented types", () => {
    for (const type of WIDE_WIDGET_TYPES) {
      expect(IMPLEMENTED_WIDGET_TYPES).toContain(type);
    }
  });
});
