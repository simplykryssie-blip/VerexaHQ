import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ClipboardList,
  FolderOpen,
  FileText,
  MessagesSquare,
  CalendarDays,
  Receipt,
  PenTool,
  FileCheck2,
  Bell,
  User,
} from "lucide-react";

export type PortalNavItem = { label: string; href: string; icon: LucideIcon };

// Every portal user sees every one of these — there is no role-based
// filtering in the portal the way there is in the staff nav, since a
// portal identity only ever maps to a single client record.
export const PORTAL_NAV_ITEMS: PortalNavItem[] = [
  { label: "Dashboard", href: "/portal", icon: LayoutDashboard },
  { label: "Organizer", href: "/portal/organizer", icon: ClipboardList },
  { label: "Documents", href: "/portal/documents", icon: FolderOpen },
  { label: "Document Requests", href: "/portal/document-requests", icon: FileText },
  { label: "Messages", href: "/portal/messages", icon: MessagesSquare },
  { label: "Appointments", href: "/portal/appointments", icon: CalendarDays },
  { label: "Invoices", href: "/portal/invoices", icon: Receipt },
  { label: "Signatures", href: "/portal/signatures", icon: PenTool },
  { label: "Completed Returns", href: "/portal/returns", icon: FileCheck2 },
  { label: "Notifications", href: "/portal/notifications", icon: Bell },
  { label: "Profile", href: "/portal/profile", icon: User },
];
