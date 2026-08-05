import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Briefcase, FolderOpen, MessageSquare, Receipt, ClipboardList, Bell, User, History } from "lucide-react";

export type PortalNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

// Signatures live inside the Documents workspace's own Signatures tab
// (components/documents/DocumentWorkspace.tsx, audience="portal") rather
// than a duplicate top-level page. Appointments has no backing table
// anywhere in the schema, so it isn't listed here -- see PLATFORM.md gaps.
export const PORTAL_NAV_ITEMS: PortalNavItem[] = [
  { label: "Dashboard", href: "/portal/dashboard", icon: LayoutDashboard },
  { label: "Engagements", href: "/portal/engagements", icon: Briefcase },
  { label: "Documents", href: "/portal/documents", icon: FolderOpen },
  { label: "Messages", href: "/portal/messages", icon: MessageSquare },
  { label: "Billing", href: "/portal/billing", icon: Receipt },
  { label: "Organizer", href: "/portal/organizer", icon: ClipboardList },
  { label: "Notifications", href: "/portal/notifications", icon: Bell },
  { label: "Activity", href: "/portal/activity", icon: History },
  { label: "Profile", href: "/portal/profile", icon: User },
];
