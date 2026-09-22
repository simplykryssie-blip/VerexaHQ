/**
 * Static widget registry for the Executive Dashboard. Each row in
 * dashboard_widgets carries a widget_type that must match one of the
 * values in that table's own CHECK constraint (a taxonomy that already
 * existed from an earlier phase -- extended here with quick_actions,
 * calendar, and recent_activity rather than replaced). This registry maps
 * that same vocabulary to a component and a default title; adding a new
 * dashboard card means adding one value to the DB constraint plus one
 * entry here, not a new table.
 */
export type WidgetType =
  | "revenue"
  | "kpis"
  | "collections"
  | "missing_documents"
  | "messages"
  | "todays_work"
  | "review_queue"
  | "quick_actions"
  | "calendar"
  | "recent_activity"
  | "top_services"
  | "engagement_pipeline"
  | "deadline_risk"
  // Retired: absorbed into another type's rendering (see IMPLEMENTED_WIDGET_TYPES)
  // or relocated off the dashboard entirely. Still allowed in the DB CHECK
  // constraint and left in existing dashboard_widgets/user_widget_preferences
  // rows -- just no longer implemented, same as the reserved types below.
  | "stage_breakdown"
  | "unassigned_engagements"
  | "overdue_requests"
  | "failed_automations"
  // Reserved in the DB constraint for future modules -- no live data
  // source yet, so nothing renders them today.
  | "returns_due"
  | "signatures_pending"
  | "staff_workload"
  | "client_health"
  | "compliance";

/**
 * Widget types with a real, live-data-backed component today.
 *
 * "kpis" (renders as "Engagements"), "calendar" (renders as "Today"), and
 * "missing_documents" (renders as "Client Requests") each absorbed a former
 * sibling widget's content in the dashboard consolidation pass -- see
 * DashboardShell's renderWidget(). unassigned_engagements, overdue_requests,
 * stage_breakdown, and failed_automations are retired the same way the
 * reserved types below already were: dropped from this list (and so from
 * isWidgetType()) without deleting their dashboard_widgets/
 * user_widget_preferences rows, which is a non-destructive, purely additive
 * change -- no migration required for the retirement itself.
 */
export const IMPLEMENTED_WIDGET_TYPES: WidgetType[] = [
  "revenue",
  "kpis",
  "collections",
  "missing_documents",
  "messages",
  "todays_work",
  "review_queue",
  "quick_actions",
  "calendar",
  "recent_activity",
  "top_services",
  "engagement_pipeline",
  "deadline_risk",
];

/** Widgets that are inherently a wide strip rather than a card -- span the full dashboard grid row instead of one cell. */
export const WIDE_WIDGET_TYPES: Set<WidgetType> = new Set(["engagement_pipeline"]);

/**
 * Groups the flat widget list into labeled sections for display -- purely a
 * render-time grouping (the underlying dashboard_widgets rows stay one flat
 * ordered list, so "Customize" reordering/hiding is unaffected). A widget's
 * section is fixed by its type, not user-configurable, since it reflects
 * what kind of information it is (a running number vs. something needing
 * action vs. reference/planning context) rather than a layout preference.
 */
export const WIDGET_SECTIONS: { label: string; types: WidgetType[] }[] = [
  { label: "Key Metrics", types: ["revenue", "kpis", "collections", "missing_documents", "messages"] },
  {
    label: "Action Queue",
    types: ["todays_work", "review_queue", "deadline_risk"],
  },
  {
    label: "Reports & Planning",
    types: ["quick_actions", "calendar", "recent_activity", "top_services", "engagement_pipeline"],
  },
];

export function isWidgetType(value: string): value is WidgetType {
  return (IMPLEMENTED_WIDGET_TYPES as string[]).includes(value);
}
