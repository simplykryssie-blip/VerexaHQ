import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Calendar,
  BarChart3,
  Settings,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "Engagements", href: "/engagements", icon: Briefcase },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];

export type SettingsNavItem = {
  label: string;
  href: string;
};

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { label: "Firm Profile", href: "/settings/firm-profile" },
  { label: "Brand Center", href: "/settings/brand-center" },
  { label: "Users & Staff", href: "/settings/users" },
  { label: "Roles & Permissions", href: "/settings/roles" },
  { label: "Security", href: "/settings/security" },
  { label: "Integrations", href: "/settings/integrations" },
  { label: "Notifications", href: "/settings/notifications" },
  { label: "Workspace Preferences", href: "/settings/preferences" },
  { label: "Audit Logs", href: "/settings/audit-logs" },
];
