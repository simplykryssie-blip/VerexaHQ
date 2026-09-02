import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  UserCheck,
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
  Flag,
  ScrollText,
  Zap,
  ClipboardCheck,
  LifeBuoy,
  Kanban,
  Tags,
  GraduationCap,
  Globe,
  CreditCard,
  Wrench,
  Package,
  Palette,
  Receipt,
  Handshake,
  Sparkles,
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
  { label: "Billing", href: "/billing", icon: Receipt },
  { label: "Review Queue", href: "/review-queue", icon: ClipboardCheck },
  { label: "Pipelines", href: "/pipelines", icon: Kanban },
  { label: "Workflows", href: "/workflows", icon: Zap },
  {
    label: "Websites",
    icon: Globe,
    children: [
      { label: "Websites", href: "/websites" },
      { label: "Funnels", href: "/funnels" },
    ],
  },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Documents", href: "/documents", icon: FolderOpen },
  { label: "Tax Office", href: "/tax", icon: Landmark },
  { label: "Partners", href: "/partners", icon: Handshake },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Learning Hub", href: "/learning", icon: GraduationCap },
  {
    label: "Templates",
    icon: LayoutTemplate,
    children: [
      { label: "Email & SMS", href: "/automations" },
      { label: "Form Templates", href: "/templates" },
    ],
  },
  { label: "Support", href: "/support", icon: LifeBuoy },
  { label: "Settings", href: "/settings", icon: Settings },
];

export type NavSection = { label: string; items: NavItem[] };

/**
 * Groups by how often staff actually open each destination, not a generic SaaS taxonomy --
 * derived from NAV_ITEMS (by label) so there's one list of items, not two that can drift.
 */
const NAV_SECTION_MEMBERS: { label: string; itemLabels: string[] }[] = [
  { label: "Daily", itemLabels: ["Dashboard", "Contacts", "Engagements", "Billing", "Review Queue", "Calendar", "Messages"] },
  { label: "Build", itemLabels: ["Pipelines", "Workflows", "Websites", "Templates"] },
  { label: "Reference", itemLabels: ["Documents", "Tax Office", "Partners", "Reports", "Learning Hub"] },
  { label: "Admin", itemLabels: ["Support", "Settings"] },
];

export const NAV_SECTIONS: NavSection[] = NAV_SECTION_MEMBERS.map((section) => ({
  label: section.label,
  items: section.itemLabels.map((label) => NAV_ITEMS.find((item) => item.label === label)).filter((item): item is NavItem => Boolean(item)),
}));

/**
 * Verexa HQ (the platform's own is_platform_home workspace) doesn't serve
 * real clients -- its job is running and monitoring the CRM platform
 * itself, not the client-facing operations every other workspace's nav is
 * built around. "Dashboard"/"Billing"/"Systems" point at the /platform-admin
 * tooling instead of the regular per-workspace pages of the same name.
 */
export const PLATFORM_HOME_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/platform-admin", icon: LayoutDashboard },
  { label: "Billing", href: "/platform-admin/billing", icon: CreditCard },
  { label: "Systems", href: "/platform-admin/systems", icon: Wrench },
  { label: "AI Agents", href: "/platform-admin/ai-agents", icon: Sparkles },
  // Contacts/Engagements/Review Queue/Messages are the platform-admin
  // equivalents of the client-facing CRM nav's own tabs of the same name --
  // account holders instead of clients, terms/privacy acceptance instead of
  // client work, admin to-dos instead of client review items.
  { label: "Contacts", href: "/platform-admin/accounts", icon: Users },
  { label: "Engagements", href: "/platform-admin/agreements", icon: Briefcase },
  { label: "Review Queue", href: "/platform-admin/review", icon: ClipboardCheck },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  {
    label: "Pipelines & Workflows",
    icon: Kanban,
    children: [
      { label: "Pipelines", href: "/pipelines" },
      { label: "Workflows", href: "/workflows" },
    ],
  },
  {
    label: "Websites",
    icon: Globe,
    children: [
      { label: "Websites", href: "/websites" },
      { label: "Funnels", href: "/funnels" },
    ],
  },
  {
    label: "Templates",
    icon: LayoutTemplate,
    children: [
      { label: "Email & SMS", href: "/automations" },
      { label: "Form Templates", href: "/templates" },
    ],
  },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Documents", href: "/documents", icon: FolderOpen },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Learning Hub", href: "/learning", icon: GraduationCap },
  { label: "Support", href: "/support", icon: LifeBuoy },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const PLATFORM_HOME_NAV_SECTIONS: NavSection[] = [{ label: "Verexa HQ", items: PLATFORM_HOME_NAV_ITEMS }];

/**
 * Shortcuts into the team-management corner of Settings, surfaced as their
 * own top-level section for an ERO/Service Bureau/multi-office firm --
 * see isEroManagementTier(). These are the same pages Settings already
 * lists (Users & Staff -- which also holds Connections, folded into the
 * same page -- and Firm Profile), just promoted out of a nested settings
 * sub-nav for a workspace that actually runs a team, rather than
 * duplicated pages.
 */
export const ERO_MANAGEMENT_NAV_ITEMS: NavItem[] = [
  { label: "ERO Dashboard", href: "/ero-dashboard", icon: LayoutDashboard },
  { label: "Team", href: "/settings/users", icon: Users },
  { label: "Assignments", href: "/assignments", icon: UserCheck },
  { label: "ERO Profile", href: "/settings/firm-profile", icon: Building2 },
];

export const ERO_MANAGEMENT_NAV_SECTION: NavSection = { label: "ERO Management", items: ERO_MANAGEMENT_NAV_ITEMS };

export type SettingsNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { label: "Firm Profile", href: "/settings/firm-profile", icon: Building2 },
  { label: "Plan & Usage", href: "/settings/plan-usage", icon: CreditCard },
  { label: "Branding", href: "/settings/brand-center", icon: Palette },
  { label: "Services", href: "/settings/services", icon: Package },
  { label: "Users & Staff", href: "/settings/users", icon: Users },
  { label: "Roles & Permissions", href: "/settings/roles", icon: KeyRound },
  { label: "Tags", href: "/settings/tags", icon: Tags },
  { label: "Security", href: "/settings/security", icon: ShieldCheck },
  { label: "Integrations", href: "/settings/integrations", icon: Plug },
  { label: "Notifications", href: "/settings/notifications", icon: Bell },
  { label: "Feature Flags", href: "/settings/feature-flags", icon: Flag },
  { label: "Audit Logs", href: "/settings/audit-logs", icon: ScrollText },
];

export type SettingsNavSection = { label: string; items: SettingsNavItem[] };

const SETTINGS_SECTION_MEMBERS: { label: string; itemLabels: string[] }[] = [
  { label: "Personal", itemLabels: ["Security", "Notifications"] },
  { label: "Firm", itemLabels: ["Firm Profile", "Plan & Usage", "Branding", "Services", "Users & Staff", "Roles & Permissions", "Tags"] },
  { label: "System", itemLabels: ["Integrations", "Feature Flags", "Audit Logs"] },
];

export const SETTINGS_NAV_SECTIONS: SettingsNavSection[] = SETTINGS_SECTION_MEMBERS.map((section) => ({
  label: section.label,
  items: section.itemLabels.map((label) => SETTINGS_NAV_ITEMS.find((item) => item.label === label)).filter((item): item is SettingsNavItem => Boolean(item)),
}));
