import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Briefcase, FolderOpen, MessageSquare, Receipt, ClipboardList, CalendarClock, Bell, User, History, Handshake, CheckSquare } from "lucide-react";

export type PortalNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

// Signatures live inside the Documents workspace's own Signatures tab
// (components/documents/DocumentWorkspace.tsx, audience="portal") rather
// than a duplicate top-level page.
export const PORTAL_NAV_ITEMS: PortalNavItem[] = [
  { label: "Dashboard", href: "/portal/dashboard", icon: LayoutDashboard },
  { label: "Engagements", href: "/portal/engagements", icon: Briefcase },
  { label: "Tasks", href: "/portal/tasks", icon: CheckSquare },
  { label: "Quotes", href: "/portal/quotes", icon: Handshake },
  { label: "Documents", href: "/portal/documents", icon: FolderOpen },
  { label: "Messages", href: "/portal/messages", icon: MessageSquare },
  { label: "Billing", href: "/portal/billing", icon: Receipt },
  { label: "Organizer", href: "/portal/organizer", icon: ClipboardList },
  { label: "Appointments", href: "/portal/appointments", icon: CalendarClock },
  { label: "Notifications", href: "/portal/notifications", icon: Bell },
  { label: "Activity", href: "/portal/activity", icon: History },
  { label: "Profile", href: "/portal/profile", icon: User },
];
