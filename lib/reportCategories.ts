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
    description: "Client growth and lifecycle status breakdown.",
  },
  {
    slug: "engagements",
    title: "Engagements",
    description: "Engagement volume by status, type, and turnaround time.",
  },
  {
    slug: "billing",
    title: "Billing",
    description: "Quote funnel by status across the workspace -- see Revenue for invoices and collections.",
  },
  {
    slug: "documents",
    title: "Documents",
    description: "Missing documents, upload activity, signatures, storage, and request completion.",
  },
  {
    slug: "staff-productivity",
    title: "Staff",
    description: "Assigned workload, task completion rate, and review turnaround by staff member.",
  },
  {
    slug: "compliance",
    title: "Compliance",
    description: "Security events, sensitive data access, failed logins, and MFA adoption. Admins only.",
  },
  {
    slug: "growth",
    title: "Growth",
    description: "New clients and engagements over time.",
  },
];
