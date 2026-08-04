import Link from "next/link";
import { UserPlus, Briefcase, Receipt, ClipboardList, CalendarPlus, Mail } from "lucide-react";
import { WidgetShell } from "./WidgetShell";

const ACTIONS = [
  { label: "New Client", href: "/clients", icon: UserPlus },
  { label: "New Engagement", href: "/engagements/new", icon: Briefcase },
  { label: "Create Invoice", href: "/clients", icon: Receipt },
  { label: "Request Documents", href: "/clients", icon: ClipboardList },
  { label: "Schedule Appointment", href: "/calendar", icon: CalendarPlus },
  { label: "Invite Staff", href: "/settings/users", icon: Mail },
] as const;

export function QuickActionsWidget() {
  return (
    <WidgetShell title="Quick Actions">
      <nav aria-label="Quick actions" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ACTIONS.map((a) => (
          <Link
            key={a.label}
            href={a.href}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-border px-3 py-3 text-center text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
          >
            <a.icon size={18} aria-hidden="true" />
            {a.label}
          </Link>
        ))}
      </nav>
    </WidgetShell>
  );
}
