"use client";

import { DocumentWorkspace } from "@/components/documents/DocumentWorkspace";
import { Tabs } from "@/components/ui/Tabs";
import { isIndependentTier } from "@/lib/workspaceCapabilities";
import { OverviewTab, MessagesTab, BillingTab, NotesTab, TasksTab, TimelineTab } from "./ClientWorkspaceTabs";
import type { ClientWorkspaceProps } from "./ClientWorkspace";

// Contacts Pass 3: Timeline was already fully built (ClientWorkspaceTabs'
// own TimelineTab) but never wired into this tab bar -- general Contact
// history (status changes, payments, notes, emails, organizer events,
// signatures) had no home of its own, so Documents' "Show activity" panel
// was the only place any of it surfaced, unfiltered. It's now a real tab,
// which is what makes narrowing Documents' own activity panel to
// document-specific events (Pass 5) safe to do without losing anything.
export const TABS = ["Details", "Tasks", "Documents", "Messages", "Billing", "Notes", "Timeline"] as const;
export type ClientTab = (typeof TABS)[number];

function displayName(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null }) {
  if (c.client_type !== "individual" && c.business_name) return c.business_name;
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
    completedTasks,
    bankProductTransactions,
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
            onShowTasks={() => onTabChange("Tasks")}
          />
        )}
        {tab === "Tasks" && (
          <TasksTab
            clientId={client.id}
            workspaceId={workspace.id}
            tasks={tasks}
            completedTasks={completedTasks}
            staffOptions={staffOptions}
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
            bankProductTransactions={bankProductTransactions}
          />
        )}
        {tab === "Notes" && <NotesTab clientId={client.id} workspaceId={workspace.id} notes={notes} />}
        {tab === "Timeline" && <TimelineTab timeline={timeline} />}
      </div>
    </>
  );
}

export { displayName };
