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
  Kanban,
} from "lucide-react";
import type { IconChipTone } from "@/components/ui/IconChip";

export type ReportCategory = {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: IconChipTone;
};

export const REPORT_CATEGORIES: ReportCategory[] = [
  {
    slug: "financial",
    title: "Revenue",
    description: "Revenue collected by period, plus outstanding balances and collections.",
    icon: DollarSign,
    tone: "emerald",
  },
  {
    slug: "clients",
    title: "Clients",
    description: "Client growth and lifecycle status breakdown.",
    icon: Users,
    tone: "accent",
  },
  {
    slug: "engagements",
    title: "Engagements",
    description: "Engagement volume by status, type, and turnaround time.",
    icon: Briefcase,
    tone: "violet",
  },
  {
    slug: "billing",
    title: "Billing",
    description: "Quote funnel by status across the workspace -- see Revenue for invoices and collections.",
    icon: Receipt,
    tone: "amber",
  },
  {
    slug: "documents",
    title: "Documents",
    description: "Missing documents, upload activity, signatures, storage, and request completion.",
    icon: FolderOpen,
    tone: "rose",
  },
  {
    slug: "staff-productivity",
    title: "Staff",
    description: "Assigned workload, task completion rate, and review turnaround by staff member.",
    icon: UserCheck,
    tone: "accent",
  },
  {
    slug: "team-performance",
    title: "Team Performance",
    description: "Where each person's engagements sit in the pipeline right now, by stage.",
    icon: Kanban,
    tone: "violet",
  },
  {
    slug: "compliance",
    title: "Compliance",
    description: "Security events, sensitive data access, failed logins, and MFA adoption. Admins only.",
    icon: ShieldCheck,
    tone: "amber",
  },
  {
    slug: "growth",
    title: "Growth",
    description: "New clients and engagements over time.",
    icon: TrendingUp,
    tone: "emerald",
  },
];
