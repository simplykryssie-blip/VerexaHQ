import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ListChecks,
  CalendarDays,
  UsersRound,
  Users,
  Home,
  FileText,
  ClipboardList,
  FolderOpen,
  CheckSquare,
  Workflow,
  ShieldCheck,
  PenTool,
  MessagesSquare,
  Bell,
  History,
  Receipt,
  CreditCard,
  Briefcase,
  BarChart3,
  UserCog,
  Building2,
  Palette,
  Plug,
  LayoutTemplate,
  Wallet,
  ScrollText,
  Handshake,
} from "lucide-react";
import type { Capability } from "@/lib/permissions/capabilities";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  requires?: Capability;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Work Queue", href: "/work-queue", icon: ListChecks },
      { label: "Calendar", href: "/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Relationships",
    items: [
      { label: "Leads", href: "/leads", icon: UsersRound },
      { label: "Clients", href: "/clients", icon: Users },
      { label: "Households", href: "/households", icon: Home },
    ],
  },
  {
    label: "Tax Operations",
    items: [
      { label: "Tax Engagements", href: "/engagements", icon: Briefcase },
      { label: "Intake Organizers", href: "/intake", icon: FileText },
      { label: "Document Requests", href: "/document-requests", icon: ClipboardList },
      { label: "Documents", href: "/documents", icon: FolderOpen },
      { label: "Tasks", href: "/tasks", icon: CheckSquare },
      { label: "Workflows", href: "/workflows", icon: Workflow, requires: "manage_workflows" },
      { label: "Compliance", href: "/compliance", icon: ShieldCheck, requires: "manage_compliance" },
      { label: "Signatures", href: "/signatures", icon: PenTool },
    ],
  },
  {
    label: "Communication",
    items: [
      { label: "Messages", href: "/messages", icon: MessagesSquare },
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "Communication History", href: "/communication-history", icon: History },
    ],
  },
  {
    label: "Financial",
    items: [
      { label: "Invoices", href: "/invoices", icon: Receipt, requires: "manage_billing" },
      { label: "Payments", href: "/payments", icon: CreditCard, requires: "manage_billing" },
      { label: "Services", href: "/services", icon: Wallet },
    ],
  },
  {
    label: "Reports",
    items: [{ label: "Office Reports", href: "/reports", icon: BarChart3, requires: "view_reports" }],
  },
  {
    label: "Administration",
    items: [
      { label: "Team", href: "/team", icon: UserCog, requires: "manage_team" },
      { label: "Office Settings", href: "/settings", icon: Building2, requires: "manage_workspace" },
      { label: "Branding", href: "/settings/branding", icon: Palette, requires: "manage_workspace" },
      { label: "Integrations", href: "/settings/integrations", icon: Plug, requires: "manage_integrations" },
      { label: "Templates", href: "/templates", icon: LayoutTemplate, requires: "manage_templates" },
      { label: "Subscription", href: "/settings/subscription", icon: Wallet, requires: "manage_workspace" },
      { label: "Workspace Relationships", href: "/relationships", icon: Handshake, requires: "manage_workspace" },
      { label: "Audit Logs", href: "/audit-logs", icon: ScrollText, requires: "manage_workspace" },
    ],
  },
];
