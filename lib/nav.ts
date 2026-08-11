import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Calendar,
  FolderOpen,
  MessageSquare,
  Landmark,
  BarChart3,
  Settings,
  LayoutTemplate,
  UserCircle,
  Building2,
  KeyRound,
  ShieldCheck,
  Plug,
  Bell,
  Workflow,
  Flag,
  ScrollText,
  Kanban,
  Zap,
  Link2,
  ClipboardCheck,
} from "lucide-react";

export type NavLeaf = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label: string;
  icon: LucideIcon;
  children: { label: string; href: string }[];
};

export type NavItem = NavLeaf | NavGroup;

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Contacts", href: "/clients", icon: Users },
  { label: "Engagements", href: "/engagements", icon: Briefcase },
  { label: "Review Queue", href: "/review-queue", icon: ClipboardCheck },
  { label: "Pipelines", href: "/pipelines", icon: Kanban },
  { label: "Workflows", href: "/workflows", icon: Zap },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Documents", href: "/documents", icon: FolderOpen },
  { label: "Tax Office", href: "/tax", icon: Landmark },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  {
    label: "Templates",
    icon: LayoutTemplate,
    children: [
      { label: "Email & SMS", href: "/automations" },
      { label: "Form Templates", href: "/templates" },
    ],
  },
  { label: "Services", href: "/service-packages", icon: Workflow },
  { label: "Settings", href: "/settings", icon: Settings },
];

export type SettingsNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { label: "My Account", href: "/settings/my-account", icon: UserCircle },
  { label: "Firm Profile", href: "/settings/firm-profile", icon: Building2 },
  { label: "Users & Staff", href: "/settings/users", icon: Users },
  { label: "Connections", href: "/settings/connections", icon: Link2 },
  { label: "Roles & Permissions", href: "/settings/roles", icon: KeyRound },
  { label: "Security", href: "/settings/security", icon: ShieldCheck },
  { label: "Integrations", href: "/settings/integrations", icon: Plug },
  { label: "Notifications", href: "/settings/notifications", icon: Bell },
  { label: "Feature Flags", href: "/settings/feature-flags", icon: Flag },
  { label: "Audit Logs", href: "/settings/audit-logs", icon: ScrollText },
];
