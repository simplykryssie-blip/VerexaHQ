"use client";

import { DocumentWorkspace } from "@/components/documents/DocumentWorkspace";
import { Tabs } from "@/components/ui/Tabs";
import { isIndependentTier } from "@/lib/workspaceCapabilities";
import { OverviewTab, MessagesTab, BillingTab, NotesTab } from "./ClientWorkspaceTabs";
import type { ClientWorkspaceProps } from "./ClientWorkspace";

export const TABS = ["Details", "Documents", "Messages", "Billing", "Notes"] as const;
export type ClientTab = (typeof TABS)[number];

function displayName(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null }) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

/** The client's tab bar + tab content -- the one part of the client detail
 * view the full page and the Quick-View drawer must render identically, so
 * it lives here instead of inlined in either. Everything either surface
 * doesn't need for its own chrome (header, right rail, stat grid, ...) still
 * comes in via the same full ClientWorkspaceProps shape so this never drifts
 * from what the full page actually has available. */
export function ClientTabsBody({
  tab,
  onTabChange,
  ...data
}: ClientWorkspaceProps & { tab: ClientTab; onTabChange: (t: ClientTab) => void }) {
  const {
    workspace,
    client,
    permissions,
    contacts,
    addresses,
    emails,
    phones,
    workspaceTags,
    portalUsers,
    pendingPortalInvites,
    relationships,
    staffOptions,
    accountHolder,
    rmDefault,
    reviewerDefault,
    complianceDefault,
    engagements,
    tasks,
    appointments,
    invoices,
    notes,
    outstandingBalance,
    organizerResponses,
    workspaceServices,
    interestedServiceIds,
    documentFolders,
    documents,
    documentRequests,
    documentRequestTemplates,
    signatureRequests,
    engagementLetterTemplates,
    timeline,
    additionalSigners,
    messageThreads,
    messages,
    quotes,
    payments,
    paymentPlansByInvoice,
  } = data;
  const showStaffRoles = !isIndependentTier(workspace);

  return (
    <>
      <div className="border-b border-border bg-surface px-8">
        <Tabs tabs={TABS.map((t) => ({ id: t, label: t }))} active={tab} onChange={(id) => onTabChange(id as ClientTab)} />
      </div>

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
            onCreateInvoice={() => onTabChange("Billing")}
            onShowNotes={() => onTabChange("Notes")}
            onCreateNote={() => onTabChange("Notes")}
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
            additionalSigners={additionalSigners}
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
            onViewDocumentRequests={() => onTabChange("Documents")}
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
    </>
  );
}

export { displayName };
