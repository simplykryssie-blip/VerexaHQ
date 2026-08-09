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
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Contacts", href: "/clients", icon: Users },
  { label: "Engagements", href: "/engagements", icon: Briefcase },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Documents", href: "/documents", icon: FolderOpen },
  { label: "Tax Office", href: "/tax", icon: Landmark },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Templates", href: "/settings/templates", icon: LayoutTemplate },
  { label: "Settings", href: "/settings", icon: Settings },
];

export type SettingsNavItem = {
  label: string;
  href: string;
};

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { label: "My Account", href: "/settings/my-account" },
  { label: "Firm Profile", href: "/settings/firm-profile" },
  { label: "Brand Center", href: "/settings/brand-center" },
  { label: "Users & Staff", href: "/settings/users" },
  { label: "Roles & Permissions", href: "/settings/roles" },
  { label: "Security", href: "/settings/security" },
  { label: "Integrations", href: "/settings/integrations" },
  { label: "Notifications", href: "/settings/notifications" },
  { label: "Automations", href: "/settings/automations" },
  { label: "Workflow Setup", href: "/settings/service-packages" },
  { label: "Feature Flags", href: "/settings/feature-flags" },
  { label: "Workspace Preferences", href: "/settings/preferences" },
  { label: "Audit Logs", href: "/settings/audit-logs" },
];
