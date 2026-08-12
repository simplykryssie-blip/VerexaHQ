"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus, Briefcase, Receipt, ClipboardList, CalendarPlus, Mail, Lock } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import { QuickActionClientPicker } from "./QuickActionClientPicker";

export type QuickActionPermissions = {
  clientsCreate: boolean;
  engagementsManage: boolean;
  billingManage: boolean;
  documentsRequest: boolean;
  appointmentsManage: boolean;
  isAdmin: boolean;
};

type Action =
  | { label: string; href: string; icon: typeof UserPlus; key: keyof QuickActionPermissions; kind: "link" }
  | { label: string; icon: typeof UserPlus; key: keyof QuickActionPermissions; kind: "pick-client"; destinationTab: "Billing" | "Documents" };

const ACTIONS: Action[] = [
  { label: "New Client", href: "/clients", icon: UserPlus, key: "clientsCreate", kind: "link" },
  { label: "New Engagement", href: "/engagements/new", icon: Briefcase, key: "engagementsManage", kind: "link" },
  { label: "Create Invoice", icon: Receipt, key: "billingManage", kind: "pick-client", destinationTab: "Billing" },
  { label: "Request Documents", icon: ClipboardList, key: "documentsRequest", kind: "pick-client", destinationTab: "Documents" },
  { label: "Schedule Appointment", href: "/calendar", icon: CalendarPlus, key: "appointmentsManage", kind: "link" },
  { label: "Invite Staff", href: "/settings/users", icon: Mail, key: "isAdmin", kind: "link" },
];

export function QuickActionsWidget({ permissions, workspaceId }: { permissions: QuickActionPermissions; workspaceId: string }) {
  const visible = ACTIONS.filter((a) => permissions[a.key]);
  const [picking, setPicking] = useState<{ title: string; destinationTab: "Billing" | "Documents" } | null>(null);

  return (
    <WidgetShell title="Quick Actions">
      {visible.length === 0 ? (
        <EmptyState icon={Lock} message="No quick actions available for your role." />
      ) : (
        <nav aria-label="Quick actions" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {visible.map((a) =>
            a.kind === "link" ? (
              <Link
                key={a.label}
                href={a.href}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-border px-3 py-3 text-center text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
              >
                <a.icon size={18} aria-hidden="true" />
                {a.label}
              </Link>
            ) : (
              <button
                key={a.label}
                type="button"
                onClick={() => setPicking({ title: a.label, destinationTab: a.destinationTab })}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-border px-3 py-3 text-center text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
              >
                <a.icon size={18} aria-hidden="true" />
                {a.label}
              </button>
            )
          )}
        </nav>
      )}

      {picking && (
        <QuickActionClientPicker
          workspaceId={workspaceId}
          title={`${picking.title}: choose a client`}
          destinationTab={picking.destinationTab}
          onClose={() => setPicking(null)}
        />
      )}
    </WidgetShell>
  );
}
