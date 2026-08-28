"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { QuickActions } from "./QuickActions";
import { ConvertLeadButton } from "./ConvertLeadButton";
import { MarkLeadLostButton } from "./MarkLeadLostButton";
import Link from "next/link";
import { DocumentWorkspace } from "@/components/documents/DocumentWorkspace";
import type { ActionPermissions } from "@/lib/actionPermissions";
import type { PaymentPlanRow } from "@/components/billing/PaymentPlanList";
import type { DocumentFolderRow, DocumentRequestRow, DocumentRow, SignatureRequestRow } from "@/components/documents/types";
import { isIndependentTier } from "@/lib/workspaceCapabilities";
import { automationActionLabel } from "@/lib/automationLabels";
import {
  OverviewTab,
  MessagesTab,
  BillingTab,
  NotesTab,
  type ContactRow,
  type AddressRow,
  type EmailRow,
  type PhoneRow,
  type PortalUserRow,
  type PendingPortalInviteRow,
  type RelationshipRow,
  type NoteRow,
  type ActivityRow,
  type TaskRow,
  type QuoteRow,
  type InvoiceRow,
  type PaymentRow,
  type MessageThreadRow,
  type MessageRow,
  type EngagementRow,
  type ClientHeaderInfo,
  type OrganizerResponseRow,
  type AppointmentRow,
  type StaffOption,
} from "./ClientWorkspaceTabs";

type Workspace = { id: string; name: string; workspace_type: string };

type ClientRow = {
  id: string;
  client_number: string | null;
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
  ssn_last4: string | null;
  ein_last4: string | null;
  itin_last4: string | null;
  date_of_birth: string | null;
  relationship_manager: ClientHeaderInfo["relationship_manager"];
  default_reviewer: ClientHeaderInfo["default_reviewer"];
  default_compliance_officer: ClientHeaderInfo["default_compliance_officer"];
};

type LedgerEntry = { id: string; balance_after: number; created_at: string };

const TABS = [
  "Details",
  "Documents",
  "Messages",
  "Billing",
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
  emails,
  phones,
  workspaceTags,
  relationships,
  portalUsers,
  pendingPortalInvites,
  engagements,
  notes,
  documents,
  documentFolders,
  documentRequests,
  signatureRequests,
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
  organizerTemplates,
  pendingOrganizerTemplateIds,
  organizerResponses,
  workspaceServices,
  engagementLetterTemplates,
  permissions,
  paymentPlansByInvoice,
  appointments,
  staffOptions,
  accountHolder,
  rmDefault,
  reviewerDefault,
  complianceDefault,
  requestedService,
  interestedServiceIds,
  leadPipelines,
  automationStatus,
}: {
  workspace: Workspace;
  permissions: ActionPermissions;
  paymentPlansByInvoice: Record<string, PaymentPlanRow[]>;
  client: ClientRow;
  contacts: ContactRow[];
  addresses: AddressRow[];
  emails: EmailRow[];
  phones: PhoneRow[];
  workspaceTags: string[];
  relationships: RelationshipRow[];
  portalUsers: PortalUserRow[];
  pendingPortalInvites: PendingPortalInviteRow[];
  engagements: EngagementRow[];
  notes: NoteRow[];
  documents: DocumentRow[];
  documentFolders: DocumentFolderRow[];
  documentRequests: DocumentRequestRow[];
  signatureRequests: SignatureRequestRow[];
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
  organizerTemplates: { id: string; name: string }[];
  pendingOrganizerTemplateIds: string[];
  organizerResponses: OrganizerResponseRow[];
  workspaceServices: { id: string; name: string }[];
  engagementLetterTemplates: { id: string; name: string; body_html: string }[];
  appointments: AppointmentRow[];
  staffOptions: StaffOption[];
  accountHolder: { id: string; display_name: string | null } | null;
  rmDefault: { id: string; display_name: string | null } | null;
  reviewerDefault: { id: string; display_name: string | null } | null;
  complianceDefault: { id: string; display_name: string | null } | null;
  requestedService: string | null;
  interestedServiceIds: string[];
  leadPipelines: { processId: string; processName: string | null; stageName: string | null }[];
  automationStatus: { automationName: string; status: string; stepActionType: string | null; error: string | null } | null;
}) {
  const [tab, setTab] = useState<Tab>("Details");
  const showStaffRoles = !isIndependentTier(workspace);

  const openEngagement = engagements.find((e) => e.status !== "Completed" && e.status !== "Archived");
  const primaryService = openEngagement
    ? (openEngagement as unknown as { services?: { name: string } | null }).services?.name
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
  const automationStepLabel = automationStatus ? automationActionLabel(automationStatus.stepActionType) : null;
  const automationStatusText =
    automationStatus &&
    (automationStatus.status === "failed"
      ? `${automationStatus.automationName} -- failed at "${automationStepLabel}"`
      : automationStatus.status === "completed"
        ? `${automationStatus.automationName} -- completed`
        : `${automationStatus.automationName} -- ${automationStepLabel}`);

  return (
    <>
      <PageHeader
        backHref="/clients"
        backLabel="Back to Clients"
        title={displayName(client)}
        description={
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            {client.client_number && <span className="font-medium text-slate">{client.client_number}</span>}
            <span className="capitalize">{client.client_type}</span>
            {primaryService && <span>{primaryService}</span>}
            {!primaryService && requestedService && <span>Requested: {requestedService}</span>}
            <span className="capitalize">{client.lifecycle_status}</span>
            {client.lifecycle_status === "lead" &&
              leadPipelines.map((pipeline) =>
                pipeline.stageName ? (
                  <Link key={pipeline.processId} href={`/pipelines/${pipeline.processId}`} className="text-accent hover:underline">
                    {pipeline.processName ?? "Pipeline"}: {pipeline.stageName}
                  </Link>
                ) : null
              )}
            {automationStatusText && (
              <span className={automationStatus?.status === "failed" ? "text-danger" : undefined} title={automationStatus?.error ?? undefined}>
                Automation: {automationStatusText}
              </span>
            )}
            {showStaffRoles && (
              <>
                <span>Relationship manager: {client.relationship_manager?.display_name ?? "Unassigned"}</span>
                <span>Reviewer: {client.default_reviewer?.display_name ?? "Unassigned"}</span>
                <span>Compliance: {client.default_compliance_officer?.display_name ?? "Unassigned"}</span>
              </>
            )}
            <span>Client since {new Date(client.created_at).toLocaleDateString()}</span>
            <span>Portal: {portalStatus}</span>
            {client.tags?.length > 0 && <span>Tags: {client.tags.join(", ")}</span>}
          </div>
        }
      />

      <div className="flex items-center gap-2 border-b border-border bg-surface px-8 py-3">
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
            {tab === "Details" && (
              <OverviewTab
                client={client}
                workspaceId={workspace.id}
                showStaffRoles={showStaffRoles}
                canEditSensitive={permissions.clientsEditSensitive}
                contacts={contacts}
                addresses={addresses}
                emails={emails}
                phones={phones}
                workspaceTags={workspaceTags}
                portalUsers={portalUsers}
                pendingPortalInvites={pendingPortalInvites}
                relationships={relationships}
                staffOptions={staffOptions}
                accountHolder={accountHolder}
                rmDefault={rmDefault}
                reviewerDefault={reviewerDefault}
                complianceDefault={complianceDefault}
                engagements={engagements}
                tasks={tasks}
                appointments={appointments}
                invoices={invoices}
                notes={notes}
                outstandingBalance={outstandingBalance}
                organizerResponses={organizerResponses}
                workspaceServices={workspaceServices}
                interestedServiceIds={interestedServiceIds}
                onCreateInvoice={() => setTab("Billing")}
                onShowNotes={() => setTab("Notes")}
                onCreateNote={() => setTab("Notes")}
              />
            )}
            {tab === "Documents" && (
              <DocumentWorkspace
                workspaceId={workspace.id}
                entityType="client"
                entityId={client.id}
                folders={documentFolders}
                documents={documents}
                requests={documentRequests}
                requestTemplates={documentRequestTemplates}
                signatureRequests={signatureRequests}
                signatureTemplates={engagementLetterTemplates}
                clientName={displayName(client)}
                clientEmail={client.primary_email}
                firmName={workspace.name}
                activity={timeline}
                canRequestDocuments={permissions.documentsRequest}
                canRequestSignatures={permissions.signaturesRequest}
              />
            )}
            {tab === "Messages" && (
              <MessagesTab
                workspaceId={workspace.id}
                clientId={client.id}
                primaryEmail={client.primary_email}
                primaryPhone={client.primary_phone}
                permissions={permissions}
                threads={messageThreads}
                messages={messages}
                onViewDocumentRequests={() => setTab("Documents")}
              />
            )}
            {tab === "Billing" && (
              <BillingTab
                clientId={client.id}
                clientName={displayName(client)}
                workspaceName={workspace.name}
                quotes={quotes}
                invoices={invoices}
                payments={payments}
                outstandingBalance={outstandingBalance}
                workspaceId={workspace.id}
                paymentPlansByInvoice={paymentPlansByInvoice}
                canManageBilling={permissions.billingManage}
                workspaceServices={workspaceServices}
              />
            )}
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
