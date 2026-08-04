export type ReportCategory = {
  slug: string;
  title: string;
  description: string;
};

export const REPORT_CATEGORIES: ReportCategory[] = [
  {
    slug: "financial",
    title: "Revenue",
    description: "Revenue collected by period, plus outstanding balances and collections.",
  },
  {
    slug: "clients",
    title: "Clients",
    description: "Client growth, lifecycle status breakdown, and source tracking.",
  },
  {
    slug: "engagements",
    title: "Engagements",
    description: "Engagement volume by status, type, and turnaround time.",
  },
  {
    slug: "billing",
    title: "Billing",
    description: "Quotes, invoices, and payment activity across the workspace.",
  },
  {
    slug: "documents",
    title: "Documents",
    description: "Missing documents across open engagements, by client.",
  },
  {
    slug: "staff-productivity",
    title: "Staff",
    description: "Assigned workload, task completion rate, and review turnaround by staff member.",
  },
  {
    slug: "compliance",
    title: "Compliance",
    description: "Audit log activity and workflow SLA adherence.",
  },
  {
    slug: "growth",
    title: "Growth",
    description: "New clients and engagements over time.",
  },
];
