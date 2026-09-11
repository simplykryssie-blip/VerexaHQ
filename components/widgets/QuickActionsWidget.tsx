import Link from "next/link";
import { UserPlus, Briefcase, Receipt, ClipboardList, CalendarPlus, Mail, Lock } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";

export type QuickActionPermissions = {
  clientsCreate: boolean;
  engagementsManage: boolean;
  billingManage: boolean;
  documentsRequest: boolean;
  appointmentsManage: boolean;
  isAdmin: boolean;
};

const CHIP_CLASSES = {
  accent: "bg-accentSoft text-accent",
  emerald: "bg-emeraldSoft text-emerald",
  violet: "bg-violetSoft text-violet",
  amber: "bg-amberSoft text-amber",
  rose: "bg-roseSoft text-rose",
} as const;

const ACTIONS = [
  { label: "New Client", href: "/clients", icon: UserPlus, key: "clientsCreate" as const, chip: "accent" as const },
  { label: "New Engagement", href: "/engagements/new", icon: Briefcase, key: "engagementsManage" as const, chip: "violet" as const },
  { label: "Create Invoice", href: "/clients", icon: Receipt, key: "billingManage" as const, chip: "emerald" as const },
  { label: "Request Documents", href: "/clients", icon: ClipboardList, key: "documentsRequest" as const, chip: "amber" as const },
  { label: "Schedule Appointment", href: "/calendar", icon: CalendarPlus, key: "appointmentsManage" as const, chip: "rose" as const },
  { label: "Invite Staff", href: "/settings/users", icon: Mail, key: "isAdmin" as const, chip: "accent" as const },
] as const;

export function QuickActionsWidget({ permissions }: { permissions: QuickActionPermissions }) {
  const visible = ACTIONS.filter((a) => permissions[a.key]);

  return (
    <WidgetShell title="Quick Actions">
      {visible.length === 0 ? (
        <EmptyState icon={Lock} message="No quick actions available for your role." />
      ) : (
        <nav aria-label="Quick actions" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {visible.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className="flex flex-col items-center gap-2 rounded-xl border border-border px-3 py-3 text-center text-xs font-medium text-slate transition hover:border-accent"
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${CHIP_CLASSES[a.chip]}`}>
                <a.icon size={16} aria-hidden="true" />
              </span>
              {a.label}
            </Link>
          ))}
        </nav>
      )}
    </WidgetShell>
  );
}
