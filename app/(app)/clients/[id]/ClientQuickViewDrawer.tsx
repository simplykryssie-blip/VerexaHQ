"use client";

import { useRouter } from "next/navigation";
import { Maximize2, X, Briefcase, FolderOpen, FileWarning, ListChecks, Wallet, CalendarClock, MessageCircle, Contact, ArrowUpRight } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatTile } from "@/components/ui/StatTile";
import { QuickActions } from "./QuickActions";
import { ConvertLeadButton } from "./ConvertLeadButton";
import { MarkLeadLostButton } from "./MarkLeadLostButton";
import { ArchiveClientButton } from "./ArchiveClientButton";
import { clientStatusTone } from "@/lib/clientStatus";
import { formatPhone } from "@/lib/phone";
import { displayName, type ClientTab } from "./ClientTabsBody";
import { ClientInsightWidgets } from "./ClientInsightWidgets";
import type { ClientWorkspaceProps } from "./ClientWorkspace";
import { isOpenEngagementStatus } from "@/lib/engagementStatus";

/** Pure so it can be unit-tested without rendering the drawer or mocking
 * next/navigation. Mirrors the same "find the open engagement, link to its
 * existing detail route" logic the Dashboard's client widgets already use. */
export function currentEngagementHref(engagements: { id: string; status: string }[]): string | undefined {
  const open = engagements.find((e) => isOpenEngagementStatus(e.status));
  return open ? `/engagements/${open.id}` : undefined;
}

export function openEngagementsCount(engagements: { status: string }[]): number {
  return engagements.filter((e) => isOpenEngagementStatus(e.status)).length;
}

/** No per-appointment or per-client route/anchor exists on the Calendar
 * page today (confirmed: appointments carry no href in its CalendarItem
 * list, and AppointmentsList has no id-addressable view) -- linking to the
 * bare route is the most specific existing destination without redesigning
 * Calendar to add one. */
export function nextAppointmentCalendarHref(appointments: unknown[]): string | undefined {
  return appointments.length > 0 ? "/calendar" : undefined;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** The full record's own tab, as a URL param the full page reads on load
 * (ClientWorkspace's own useSearchParams) -- a real navigation (not
 * next/navigation's router), since the intercepting route
 * (app/(app)/@modal/(.)clients/[id]/page.tsx) would otherwise re-intercept
 * a client-side push to the same /clients/[id] segment and just reopen this
 * same drawer instead of landing on the full page, the same reason
 * `expand()` below already has to force a real navigation rather than a
 * router.push. */
export function fullRecordHref(clientId: string, tab?: ClientTab): string {
  return tab ? `/clients/${clientId}?tab=${encodeURIComponent(tab)}` : `/clients/${clientId}`;
}

/** Contacts Reconciliation Audit -- Quick View gap #2. This used to render
 * the exact same ClientTabsBody the full page renders (Details/Tasks/
 * Documents/Messages/Billing/Notes, fully editable) inline in the drawer --
 * not a quick view at all, just the complete record in a slide-over. Now a
 * true snapshot: identity, status, the same "attention required" banner,
 * one stat grid whose tiles link to the relevant tab on the full page
 * instead of rendering it inline, the health/risk/cross-sell insight cards,
 * and a short recent-activity list. Every one of those was already
 * lightweight, read-mostly content -- only the full tab body (and its own
 * heavy per-tab CRUD forms) was cut. Quick action buttons (Convert/Mark
 * Lost/Archive/QuickActions) stay, since a single-purpose action button is
 * not "the full record" the way an entire editable tab is. */
export function ClientQuickViewDrawer(props: ClientWorkspaceProps) {
  const router = useRouter();
  const { client, engagements, tasks, missingDocumentCount, appointments, messages, outstandingBalance, portalUsers, permissions, organizerTemplates, pendingOrganizerTemplateIds, workspace } = props;

  const openEngagement = engagements.find((e) => isOpenEngagementStatus(e.status));
  const currentServiceName = openEngagement
    ? (openEngagement as unknown as { services?: { name: string } | null }).services?.name ?? "Untitled engagement"
    : "None active";
  const currentEngagementDestination = currentEngagementHref(engagements);
  const openEngagementsTotal = openEngagementsCount(engagements);
  const missingDocuments = missingDocumentCount;
  const openTasksCount = tasks.length;
  const nextAppointment = appointments[0];
  const nextAppointmentDestination = nextAppointmentCalendarHref(appointments);
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const portalStatus = portalUsers.some((p) => p.status === "active")
    ? "Portal Active"
    : portalUsers.length > 0
      ? "Portal Invited"
      : null;

  function close() {
    router.back();
  }

  // The URL is already /clients/[id] while this drawer is showing (that's
  // what makes it refresh-safe/shareable) -- a client-side push to the same
  // href would just keep showing the intercepted drawer. A real navigation
  // forces the server to render the real, non-intercepted full page instead.
  function goToFullRecord(tab?: ClientTab) {
    window.location.href = fullRecordHref(client.id, tab);
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink/30" onClick={close} aria-hidden="true" />

      <aside className="relative flex h-full w-full flex-col overflow-y-auto bg-surface shadow-2xl lg:w-[40vw] lg:min-w-[480px] lg:max-w-[560px]">
        <div className="border-b border-border p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar name={displayName(client)} size="lg" />
              <div>
                <p className="font-display text-lg font-semibold text-ink">{displayName(client)}</p>
                <p className="text-sm text-muted">
                  {[client.primary_email, client.primary_phone ? formatPhone(client.primary_phone) : null].filter(Boolean).join(" · ") ||
                    "No contact info on file"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => goToFullRecord()}
                title="Open full record"
                aria-label="Open full record"
                className="rounded-lg p-2 text-muted transition hover:bg-surfaceMuted hover:text-ink"
              >
                <Maximize2 size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={close}
                title="Close"
                aria-label="Close"
                className="rounded-lg p-2 text-muted transition hover:bg-surfaceMuted hover:text-ink"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge tone={clientStatusTone(client.lifecycle_status)} className="capitalize">
              {client.lifecycle_status}
            </Badge>
            {portalStatus && <Badge tone="accent">{portalStatus}</Badge>}
            <span className="text-xs capitalize text-muted">{client.client_type}</span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <ConvertLeadButton clientId={client.id} lifecycleStatus={client.lifecycle_status} />
            <MarkLeadLostButton clientId={client.id} lifecycleStatus={client.lifecycle_status} />
            <ArchiveClientButton clientId={client.id} lifecycleStatus={client.lifecycle_status} />
            <QuickActions
              clientId={client.id}
              workspaceId={workspace.id}
              organizerTemplates={organizerTemplates}
              pendingOrganizerTemplateIds={pendingOrganizerTemplateIds}
              primaryEmail={client.primary_email}
              permissions={permissions}
            />
          </div>
        </div>

        {missingDocuments > 0 && (
          <div className="border-b border-warning/20 bg-warningSoft px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-warning">Attention required</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge tone="warning">{missingDocuments} Missing Document{missingDocuments === 1 ? "" : "s"}</Badge>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 border-b border-border p-5 sm:grid-cols-4">
          <StatTile
            icon={Briefcase}
            tone="accent"
            label="Current engagement"
            value={currentServiceName}
            onClick={currentEngagementDestination ? () => router.push(currentEngagementDestination) : undefined}
          />
          <StatTile
            icon={FolderOpen}
            tone="accent"
            label="Open engagements"
            value={openEngagementsTotal}
            onClick={openEngagementsTotal > 0 ? () => goToFullRecord("Details") : undefined}
          />
          <StatTile icon={FileWarning} tone="amber" label="Missing documents" value={missingDocuments} onClick={() => goToFullRecord("Documents")} />
          <StatTile icon={ListChecks} tone="amber" label="Open tasks" value={openTasksCount} onClick={() => goToFullRecord("Tasks")} />
          <StatTile
            icon={Wallet}
            tone="rose"
            label="Outstanding balance"
            value={`$${outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            onClick={() => goToFullRecord("Billing")}
          />
          <StatTile
            icon={CalendarClock}
            tone="violet"
            label="Next appointment"
            value={nextAppointment ? new Date(nextAppointment.start_at).toLocaleDateString() : "None scheduled"}
            onClick={nextAppointmentDestination ? () => router.push(nextAppointmentDestination) : undefined}
          />
          <StatTile
            icon={MessageCircle}
            tone="emerald"
            label="Last message"
            value={lastMessage ? relativeTime(lastMessage.created_at) : "No messages"}
            onClick={() => goToFullRecord("Messages")}
          />
          <StatTile icon={Contact} tone="accent" label="Client type" value={<span className="capitalize">{client.client_type}</span>} />
        </div>

        <ClientInsightWidgets {...props} />

        <div className="border-t border-border p-5">
          <SectionCard title="Recent activity">
            {props.timeline.length === 0 ? (
              <p className="text-sm text-muted">Nothing yet.</p>
            ) : (
              <ul className="space-y-2">
                {props.timeline.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3 text-sm text-slate">
                    <span>{a.description}</span>
                    <span className="shrink-0 text-xs text-muted">{relativeTime(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="mt-auto border-t border-border p-5">
          <button
            type="button"
            onClick={() => goToFullRecord()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent/90"
          >
            View full contact record <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </div>
      </aside>
    </div>
  );
}
