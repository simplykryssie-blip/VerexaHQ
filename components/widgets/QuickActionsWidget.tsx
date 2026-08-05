import Link from "next/link";
import { UserPlus, Briefcase, Receipt, ClipboardList, CalendarPlus, Mail } from "lucide-react";
import { WidgetShell } from "./WidgetShell";

export type QuickActionPermissions = {
  clientsCreate: boolean;
  engagementsManage: boolean;
  billingManage: boolean;
  documentsRequest: boolean;
  appointmentsManage: boolean;
  isAdmin: boolean;
};

const ACTIONS = [
  { label: "New Client", href: "/clients", icon: UserPlus, key: "clientsCreate" as const },
  { label: "New Engagement", href: "/engagements/new", icon: Briefcase, key: "engagementsManage" as const },
  { label: "Create Invoice", href: "/clients", icon: Receipt, key: "billingManage" as const },
  { label: "Request Documents", href: "/clients", icon: ClipboardList, key: "documentsRequest" as const },
  { label: "Schedule Appointment", href: "/appointments", icon: CalendarPlus, key: "appointmentsManage" as const },
  { label: "Invite Staff", href: "/settings/users", icon: Mail, key: "isAdmin" as const },
] as const;

export function QuickActionsWidget({ permissions }: { permissions: QuickActionPermissions }) {
  const visible = ACTIONS.filter((a) => permissions[a.key]);

  return (
    <WidgetShell title="Quick Actions">
      {visible.length === 0 ? (
        <p className="text-sm text-muted">No quick actions available for your role.</p>
      ) : (
        <nav aria-label="Quick actions" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {visible.map((a) => (
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
      )}
    </WidgetShell>
  );
}
