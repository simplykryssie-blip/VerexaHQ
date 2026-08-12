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
  Building2,
  KeyRound,
  ShieldCheck,
  Plug,
  Bell,
  Workflow,
  Flag,
  ScrollText,
  Zap,
  Link2,
  ClipboardCheck,
  LifeBuoy,
  Hammer,
  BookOpen,
  ListOrdered,
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
  { label: "Support", href: "/support", icon: LifeBuoy },
  { label: "Settings", href: "/settings", icon: Settings },
];

export type NavSection = { label: string; icon: LucideIcon; items: NavItem[] };

/**
 * Groups by how often staff actually open each destination, not a generic SaaS taxonomy --
 * derived from NAV_ITEMS (by label) so there's one list of items, not two that can drift.
 * Each section also carries its own icon -- used as the rail icon in the icon-rail shell.
 */
const NAV_SECTION_MEMBERS: { label: string; icon: LucideIcon; itemLabels: string[] }[] = [
  { label: "Daily", icon: LayoutDashboard, itemLabels: ["Dashboard", "Contacts", "Engagements", "Review Queue", "Messages"] },
  { label: "Build", icon: Hammer, itemLabels: ["Services", "Workflows", "Templates"] },
  { label: "Reference", icon: BookOpen, itemLabels: ["Calendar", "Documents", "Tax Office", "Reports"] },
  { label: "Admin", icon: Settings, itemLabels: ["Support", "Settings"] },
];

export const NAV_SECTIONS: NavSection[] = NAV_SECTION_MEMBERS.map((section) => ({
  label: section.label,
  icon: section.icon,
  items: section.itemLabels.map((label) => NAV_ITEMS.find((item) => item.label === label)).filter((item): item is NavItem => Boolean(item)),
}));

export type SettingsNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { label: "Firm Profile", href: "/settings/firm-profile", icon: Building2 },
  { label: "Lead Stages", href: "/settings/lead-stages", icon: ListOrdered },
  { label: "Users & Staff", href: "/settings/users", icon: Users },
  { label: "Connections", href: "/settings/connections", icon: Link2 },
  { label: "Roles & Permissions", href: "/settings/roles", icon: KeyRound },
  { label: "Security", href: "/settings/security", icon: ShieldCheck },
  { label: "Integrations", href: "/settings/integrations", icon: Plug },
  { label: "Notifications", href: "/settings/notifications", icon: Bell },
  { label: "Feature Flags", href: "/settings/feature-flags", icon: Flag },
  { label: "Audit Logs", href: "/settings/audit-logs", icon: ScrollText },
];

export type SettingsNavSection = { label: string; items: SettingsNavItem[] };

const SETTINGS_SECTION_MEMBERS: { label: string; itemLabels: string[] }[] = [
  { label: "Personal", itemLabels: ["Security", "Notifications"] },
  { label: "Firm", itemLabels: ["Firm Profile", "Lead Stages", "Users & Staff", "Roles & Permissions", "Connections"] },
  { label: "System", itemLabels: ["Integrations", "Feature Flags", "Audit Logs"] },
];

export const SETTINGS_NAV_SECTIONS: SettingsNavSection[] = SETTINGS_SECTION_MEMBERS.map((section) => ({
  label: section.label,
  items: section.itemLabels.map((label) => SETTINGS_NAV_ITEMS.find((item) => item.label === label)).filter((item): item is SettingsNavItem => Boolean(item)),
}));
