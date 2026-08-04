"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { QuickActions } from "./QuickActions";
import {
  OverviewTab,
  ContactsTab,
  RelationshipsTab,
  EngagementsTab,
  DocumentsTab,
  MessagesTab,
  BillingTab,
  TimelineTab,
  NotesTab,
  type ContactRow,
  type AddressRow,
  type PhoneRow,
  type EmailRow,
  type PortalUserRow,
  type RelationshipRow,
  type NoteRow,
  type DocumentRow,
  type ActivityRow,
  type TaskRow,
  type QuoteRow,
  type InvoiceRow,
  type PaymentRow,
  type MessageThreadRow,
  type MessageRow,
  type EngagementRow,
  type ClientHeaderInfo,
} from "./ClientWorkspaceTabs";

type Workspace = { id: string; name: string };

type ClientRow = {
  id: string;
  client_type: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  lifecycle_status: string;
  primary_email: string | null;
  primary_phone: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  tags: string[];
  has_portal_access: boolean;
  created_at: string;
  relationship_manager: ClientHeaderInfo["relationship_manager"];
  default_reviewer: ClientHeaderInfo["default_reviewer"];
  default_compliance_officer: ClientHeaderInfo["default_compliance_officer"];
};

type LedgerEntry = { id: string; balance_after: number; created_at: string };

const TABS = [
  "Overview",
  "Contacts",
  "Relationships",
  "Engagements",
  "Documents",
  "Messages",
  "Billing",
  "Timeline",
  "Notes",
] as const;

type Tab = (typeof TABS)[number];

function displayName(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null }) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export function ClientWorkspace({
  workspace,
  client,
  contacts,
  addresses,
  phones,
  emails,
  relationships,
  portalUsers,
  engagements,
  notes,
  documents,
  quotes,
  invoices,
  payments,
  ledgerEntries,
  outstandingBalance,
  messageThreads,
  messages,
  timeline,
  tasks,
  requestedDocumentCount,
  documentRequestTemplates,
}: {
  workspace: Workspace;
  client: ClientRow;
  contacts: ContactRow[];
  addresses: AddressRow[];
  phones: PhoneRow[];
  emails: EmailRow[];
  relationships: RelationshipRow[];
  portalUsers: PortalUserRow[];
  engagements: EngagementRow[];
  notes: NoteRow[];
  documents: DocumentRow[];
  quotes: QuoteRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  ledgerEntries: LedgerEntry[];
  outstandingBalance: number;
  messageThreads: MessageThreadRow[];
  messages: MessageRow[];
  timeline: ActivityRow[];
  tasks: TaskRow[];
  requestedDocumentCount: number;
  documentRequestTemplates: { id: string; name: string }[];
}) {
  const [tab, setTab] = useState<Tab>("Overview");

  const openEngagement = engagements.find((e) => e.status !== "Completed" && e.status !== "Archived");
  const primaryService = openEngagement
    ? (openEngagement as unknown as { engagement_types?: { name: string } | null }).engagement_types?.name
    : undefined;
  const portalStatus = portalUsers.some((p) => p.status === "active")
    ? "Active"
    : portalUsers.length > 0
      ? "Invited"
      : client.has_portal_access
        ? "Enabled"
        : "Not invited";
  const upcoming = [
    ...engagements.filter((e) => e.due_date).map((e) => e.due_date as string),
    ...tasks.filter((t) => t.due_date).map((t) => t.due_date as string),
  ].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
  const missingDocuments = Math.max(requestedDocumentCount - documents.length, 0);

  return (
    <>
      <PageHeader
        title={displayName(client)}
        description={
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="capitalize">{client.client_type}</span>
            {primaryService && <span>{primaryService}</span>}
            <span className="capitalize">{client.lifecycle_status}</span>
            <span>Relationship manager: {client.relationship_manager?.display_name ?? "Unassigned"}</span>
            <span>Reviewer: {client.default_reviewer?.display_name ?? "Unassigned"}</span>
            <span>Compliance: {client.default_compliance_officer?.display_name ?? "Unassigned"}</span>
            <span>Client since {new Date(client.created_at).toLocaleDateString()}</span>
            <span>Portal: {portalStatus}</span>
            {client.tags?.length > 0 && <span>Tags: {client.tags.join(", ")}</span>}
          </div>
        }
      />

      <div className="border-b border-border bg-surface px-8 py-3">
        <QuickActions clientId={client.id} workspaceId={workspace.id} documentRequestTemplates={documentRequestTemplates} />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <nav className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-8">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${
                  tab === t ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>

          <div className="px-8 py-6">
            {tab === "Overview" && (
              <OverviewTab
                client={client}
                engagements={engagements}
                tasks={tasks}
                timeline={timeline}
                invoices={invoices}
                notes={notes}
                outstandingBalance={outstandingBalance}
                requestedDocumentCount={requestedDocumentCount}
                documentsCount={documents.length}
              />
            )}
            {tab === "Contacts" && (
              <ContactsTab
                clientId={client.id}
                workspaceId={workspace.id}
                contacts={contacts}
                addresses={addresses}
                phones={phones}
                emails={emails}
                portalUsers={portalUsers}
              />
            )}
            {tab === "Relationships" && (
              <RelationshipsTab clientId={client.id} workspaceId={workspace.id} relationships={relationships} />
            )}
            {tab === "Engagements" && <EngagementsTab engagements={engagements} client={client} />}
            {tab === "Documents" && <DocumentsTab documents={documents} requestedDocumentCount={requestedDocumentCount} />}
            {tab === "Messages" && <MessagesTab threads={messageThreads} messages={messages} />}
            {tab === "Billing" && (
              <BillingTab quotes={quotes} invoices={invoices} payments={payments} outstandingBalance={outstandingBalance} />
            )}
            {tab === "Timeline" && <TimelineTab timeline={timeline} />}
            {tab === "Notes" && <NotesTab clientId={client.id} workspaceId={workspace.id} notes={notes} />}
          </div>
        </div>

        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-border bg-surface p-5 lg:block">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Upcoming tasks</h3>
          {tasks.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing due.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {tasks.slice(0, 5).map((t) => (
                <li key={t.id} className="text-sm text-slate">
                  {t.title}
                  {t.due_date && <span className="ml-1 text-xs text-muted">({new Date(t.due_date).toLocaleDateString()})</span>}
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">Next due date</h3>
          <p className="mt-2 text-sm text-slate">{upcoming ? new Date(upcoming).toLocaleDateString() : "None scheduled"}</p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">Missing documents</h3>
          <p className="mt-2 text-sm text-slate">{missingDocuments}</p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">Outstanding balance</h3>
          <p className="mt-2 text-sm text-slate">
            ${outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">Recent activity</h3>
          {timeline.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {timeline.slice(0, 5).map((a) => (
                <li key={a.id} className="text-sm text-slate">
                  {a.description}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}
