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
  | "active_customers"
  | "upcoming_renewals"
  | "payment_failures"
  // Reserved in the DB constraint for future modules -- no live data
  // source yet, so nothing renders them today.
  | "returns_due"
  | "signatures_pending"
  | "staff_workload"
  | "client_health"
  | "compliance";

/** Widget types with a real, live-data-backed component today. */
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
  "active_customers",
  "upcoming_renewals",
  "payment_failures",
];

export function isWidgetType(value: string): value is WidgetType {
  return (IMPLEMENTED_WIDGET_TYPES as string[]).includes(value);
}
