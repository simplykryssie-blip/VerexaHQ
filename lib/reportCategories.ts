import {
  type LucideIcon,
  DollarSign,
  Users,
  Briefcase,
  Receipt,
  FolderOpen,
  UserCheck,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

export type ReportCategory = {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export const REPORT_CATEGORIES: ReportCategory[] = [
  {
    slug: "financial",
    title: "Revenue",
    description: "Revenue collected by period, plus outstanding balances and collections.",
    icon: DollarSign,
  },
  {
    slug: "clients",
    title: "Clients",
    description: "Client growth and lifecycle status breakdown.",
    icon: Users,
  },
  {
    slug: "engagements",
    title: "Engagements",
    description: "Engagement volume by status, type, and turnaround time.",
    icon: Briefcase,
  },
  {
    slug: "billing",
    title: "Billing",
    description: "Quote funnel by status across the workspace -- see Revenue for invoices and collections.",
    icon: Receipt,
  },
  {
    slug: "documents",
    title: "Documents",
    description: "Missing documents, upload activity, signatures, storage, and request completion.",
    icon: FolderOpen,
  },
  {
    slug: "staff-productivity",
    title: "Staff",
    description: "Assigned workload, task completion rate, and review turnaround by staff member.",
    icon: UserCheck,
  },
  {
    slug: "compliance",
    title: "Compliance",
    description: "Security events, sensitive data access, failed logins, and MFA adoption. Admins only.",
    icon: ShieldCheck,
  },
  {
    slug: "growth",
    title: "Growth",
    description: "New clients and engagements over time.",
    icon: TrendingUp,
  },
];
