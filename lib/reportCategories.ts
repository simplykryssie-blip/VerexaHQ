export type ReportCategory = {
  slug: string;
  title: string;
  description: string;
};

export const REPORT_CATEGORIES: ReportCategory[] = [
  {
    slug: "clients",
    title: "Client Reports",
    description: "Client growth, lifecycle status breakdown, and source tracking.",
  },
  {
    slug: "engagements",
    title: "Engagement Reports",
    description: "Engagement volume by status, type, and turnaround time.",
  },
  {
    slug: "staff-productivity",
    title: "Staff Productivity",
    description: "Assigned workload, task completion rate, and review turnaround by staff member.",
  },
  {
    slug: "financial",
    title: "Financial",
    description: "Revenue, outstanding balances, and billing performance. Requires the billing module.",
  },
];
