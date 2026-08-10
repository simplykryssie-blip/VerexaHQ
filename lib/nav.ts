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
  Palette,
  KeyRound,
  ShieldCheck,
  Plug,
  Bell,
  Zap,
  Workflow,
  Flag,
  SlidersHorizontal,
  ScrollText,
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
  { label: "Templates", href: "/templates", icon: LayoutTemplate },
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
  { label: "Brand Center", href: "/settings/brand-center", icon: Palette },
  { label: "Users & Staff", href: "/settings/users", icon: Users },
  { label: "Roles & Permissions", href: "/settings/roles", icon: KeyRound },
  { label: "Security", href: "/settings/security", icon: ShieldCheck },
  { label: "Integrations", href: "/settings/integrations", icon: Plug },
  { label: "Notifications", href: "/settings/notifications", icon: Bell },
  { label: "Automations", href: "/settings/automations", icon: Zap },
  { label: "Workflow Setup", href: "/settings/service-packages", icon: Workflow },
  { label: "Feature Flags", href: "/settings/feature-flags", icon: Flag },
  { label: "Workspace Preferences", href: "/settings/preferences", icon: SlidersHorizontal },
  { label: "Audit Logs", href: "/settings/audit-logs", icon: ScrollText },
];
