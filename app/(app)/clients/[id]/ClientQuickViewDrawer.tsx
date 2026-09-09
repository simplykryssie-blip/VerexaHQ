"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Maximize2, Pencil, X, Briefcase, FolderOpen, FileWarning, ListChecks, Wallet, CalendarClock, MessageCircle, Contact } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatTile } from "@/components/ui/StatTile";
import { QuickActions } from "./QuickActions";
import { ConvertLeadButton } from "./ConvertLeadButton";
import { MarkLeadLostButton } from "./MarkLeadLostButton";
import { clientStatusTone } from "@/lib/clientStatus";
import { ClientTabsBody, displayName, type ClientTab } from "./ClientTabsBody";
import { ClientInsightWidgets } from "./ClientInsightWidgets";
import type { ClientWorkspaceProps } from "./ClientWorkspace";

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

/** The TaxFlowOS-style "peek" for a client -- opened by the intercepting
 * route at app/(app)/@modal/(.)clients/[id]/page.tsx when a row on /clients
 * is clicked. Reuses the exact same ClientTabsBody the full page renders (no
 * second copy of Documents/Messages/Billing/Notes logic), plus its own
 * compact header, alert banner, and stat grid that the full page doesn't
 * need since its PageHeader already carries that context. */
export function ClientQuickViewDrawer(props: ClientWorkspaceProps) {
  const router = useRouter();
  const [tab, setTab] = useState<ClientTab>("Details");
  const { client, engagements, tasks, missingDocumentCount, appointments, messages, outstandingBalance, portalUsers, permissions, organizerTemplates, pendingOrganizerTemplateIds, workspace } = props;

  const openEngagement = engagements.find((e) => e.status !== "Completed" && e.status !== "Archived");
  const currentServiceName = openEngagement
    ? (openEngagement as unknown as { services?: { name: string } | null }).services?.name ?? "Untitled engagement"
    : "None active";
  const missingDocuments = missingDocumentCount;
  const openTasksCount = tasks.length;
  const nextAppointment = appointments[0];
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
  // href would just keep showing the intercepted drawer. A reload forces
  // the server to render the real, non-intercepted full page instead.
  function expand() {
    window.location.reload();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink/30" onClick={close} aria-hidden="true" />

      <aside className="relative flex h-full w-full flex-col overflow-y-auto bg-surface shadow-2xl lg:w-[40vw] lg:min-w-[560px]">
        <div className="border-b border-border p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar name={displayName(client)} size="lg" />
              <div>
                <p className="font-display text-lg font-semibold text-ink">{displayName(client)}</p>
                <p className="text-sm text-muted">{[client.primary_email, client.primary_phone].filter(Boolean).join(" · ") || "No contact info on file"}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={expand}
                title="Open full record"
                aria-label="Open full record"
                className="rounded-lg p-2 text-muted transition hover:bg-surfaceMuted hover:text-ink"
              >
                <Maximize2 size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setTab("Details")}
                title="Edit details"
                aria-label="Edit details"
                className="rounded-lg p-2 text-muted transition hover:bg-surfaceMuted hover:text-ink"
              >
                <Pencil size={16} aria-hidden="true" />
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
          <StatTile icon={Briefcase} tone="accent" label="Current engagement" value={currentServiceName} />
          <StatTile icon={FolderOpen} tone="accent" label="Open engagements" value={engagements.filter((e) => e.status !== "Completed" && e.status !== "Archived").length} />
          <StatTile icon={FileWarning} tone="amber" label="Missing documents" value={missingDocuments} onClick={() => setTab("Documents")} />
          <StatTile icon={ListChecks} tone="amber" label="Open tasks" value={openTasksCount} onClick={() => setTab("Tasks")} />
          <StatTile
            icon={Wallet}
            tone="rose"
            label="Outstanding balance"
            value={`$${outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            onClick={() => setTab("Billing")}
          />
          <StatTile
            icon={CalendarClock}
            tone="violet"
            label="Next appointment"
            value={nextAppointment ? new Date(nextAppointment.start_at).toLocaleDateString() : "None scheduled"}
          />
          <StatTile
            icon={MessageCircle}
            tone="emerald"
            label="Last message"
            value={lastMessage ? relativeTime(lastMessage.created_at) : "No messages"}
            onClick={() => setTab("Messages")}
          />
          <StatTile icon={Contact} tone="accent" label="Client type" value={<span className="capitalize">{client.client_type}</span>} />
        </div>

        <ClientInsightWidgets {...props} />

        <ClientTabsBody {...props} tab={tab} onTabChange={setTab} />

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
      </aside>
    </div>
  );
}
