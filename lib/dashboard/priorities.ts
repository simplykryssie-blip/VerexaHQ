import type { DashboardData } from "./data";

export type PriorityItem = {
  id: string;
  label: string;
  detail: string;
  href: string;
  weight: number;
};

/**
 * Deterministic, rule-based "Today's Priorities" scorer. Every item's rank
 * is explainable from its inputs (category weight, then recency/severity)
 * -- there's no ML/AI involved. If an AI-generated summary replaces this
 * later, it should still be able to produce a ranked list shaped like
 * PriorityItem[] so callers (the widget) don't have to change.
 */
export function computeTodaysPriorities(data: DashboardData): PriorityItem[] {
  const items: PriorityItem[] = [];

  for (const t of data.overdueTasks) {
    const daysOverdue = Math.floor((Date.now() - new Date(t.due_date).getTime()) / 86_400_000);
    items.push({
      id: `task-${t.id}`,
      label: t.title,
      detail: `Task overdue by ${daysOverdue} day${daysOverdue === 1 ? "" : "s"}`,
      href: `/engagements/${t.engagement_id}`,
      weight: 100 + daysOverdue,
    });
  }

  for (const r of data.reviewItems.filter((r) => r.sla_category === "Overdue")) {
    items.push({
      id: `review-${r.workflow_stage_id}`,
      label: `${r.stage_name} awaiting review`,
      detail: r.engagement_number ?? "Engagement",
      href: `/clients/${r.client_id}`,
      weight: 95,
    });
  }

  for (const i of data.overdueInvoices) {
    const daysOverdue = Math.floor((Date.now() - new Date(i.due_date).getTime()) / 86_400_000);
    items.push({
      id: `invoice-${i.id}`,
      label: `${i.invoice_number ?? "Invoice"} overdue`,
      detail: `$${i.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} due, ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} late`,
      href: `/clients/${i.client_id}`,
      weight: 80 + Math.min(daysOverdue, 20),
    });
  }

  for (const r of data.reviewItems.filter((r) => r.sla_category === "Exceeded")) {
    items.push({
      id: `review-exceeded-${r.workflow_stage_id}`,
      label: `${r.stage_name} exceeding expected duration`,
      detail: r.engagement_number ?? "Engagement",
      href: `/clients/${r.client_id}`,
      weight: 60,
    });
  }

  for (const t of data.dueTodayTasks) {
    items.push({
      id: `due-today-${t.id}`,
      label: t.title,
      detail: "Due today",
      href: `/engagements/${t.engagement_id}`,
      weight: 40,
    });
  }

  return items.sort((a, b) => b.weight - a.weight).slice(0, 5);
}
