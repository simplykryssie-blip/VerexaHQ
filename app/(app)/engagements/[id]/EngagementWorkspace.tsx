"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { QuickActions } from "./QuickActions";
import { DeleteEngagementButton } from "./DeleteEngagementButton";
import type { ActionPermissions } from "@/lib/actionPermissions";
import { DocumentWorkspace } from "@/components/documents/DocumentWorkspace";
import type { DocumentFolderRow, DocumentRequestRow, DocumentRow, SignatureRequestRow } from "@/components/documents/types";
import type { TaxDetailRow } from "@/components/tax/TaxDetailsCard";
import { IrsNoticesPanel, type IrsNoticeRow } from "@/components/tax/IrsNoticesPanel";
import {
  OverviewTab,
  WorkflowTab,
  TasksTab,
  MessagesTab,
  ReviewTab,
  BillingTab,
  NotesTab,
  AuditTab,
  type EngagementRow,
  type ProgressRow,
  type StageRow,
  type TaskRow,
  type NoteRow,
  type MessageThreadRow,
  type MessageRow,
  type ShareRow,
  type ReviewActionRow,
  type AssignmentHistoryRow,
  type StatusHistoryRow,
  type QuoteRow,
  type InvoiceRow,
  type PaymentRow,
  type ActivityRow,
  type StaffOption,
  type OrganizerResponseRow,
} from "./EngagementWorkspaceTabs";

type Workspace = { id: string; name: string; workspace_type: string };

const TABS = [
  "Details",
  "IRS Notices",
  "Workflow",
  "Tasks",
  "Documents",
  "Messages",
  "Review",
  "Billing",
  "Notes",
  "Audit",
] as const;

type Tab = (typeof TABS)[number];

function clientLabel(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null }) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export function EngagementWorkspace({
  workspace,
  permissions,
  engagement,
  stages,
  tasks,
  documents,
  documentFolders,
  documentRequests,
  documentRequestTemplates,
  organizerTemplates,
  organizerResponses,
  signatureRequests,
  notes,
  messageThreads,
  messages,
  shares,
  reviewActions,
  assignmentHistory,
  statusHistory,
  quotes,
  invoices,
  payments,
  timeline,
  progress,
  staffOptions,
  taxDetail,
  irsNotices,
  taxYears,
}: {
  workspace: Workspace;
  permissions: ActionPermissions;
  engagement: EngagementRow;
  stages: StageRow[];
  tasks: TaskRow[];
  documents: DocumentRow[];
  documentFolders: DocumentFolderRow[];
  documentRequests: DocumentRequestRow[];
  documentRequestTemplates: { id: string; name: string }[];
  organizerTemplates: { id: string; name: string }[];
  organizerResponses: OrganizerResponseRow[];
  signatureRequests: SignatureRequestRow[];
  notes: NoteRow[];
  messageThreads: MessageThreadRow[];
  messages: MessageRow[];
  shares: ShareRow[];
  reviewActions: ReviewActionRow[];
  assignmentHistory: AssignmentHistoryRow[];
  statusHistory: StatusHistoryRow[];
  quotes: QuoteRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  timeline: ActivityRow[];
  progress: ProgressRow | null;
  staffOptions: StaffOption[];
  taxDetail: TaxDetailRow;
  irsNotices: IrsNoticeRow[];
  taxYears: number[];
}) {
  const [tab, setTab] = useState<Tab>("Details");
  const showStaffRoles = workspace.workspace_type !== "independent_ptin";

  const client = engagement.clients;
  const reviewCount = stages.filter((s) => s.status === "Waiting" || s.status === "In Progress").length;
  const openTasks = tasks.filter((t) => t.status !== "completed");
  const outstandingBalance = invoices.reduce((sum, i) => sum + Math.max(i.total_amount - i.amount_paid, 0), 0);

  return (
    <>
      <PageHeader
        backHref="/engagements"
        backLabel="Back to Engagements"
        title={engagement.engagement_number ?? "Engagement"}
        description={
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            {client && (
              <a href={`/clients/${client.id}`} className="text-accent hover:underline">
                {clientLabel(client)}
              </a>
            )}
            {engagement.services?.name && <span>{engagement.services.name}</span>}
            <span className="capitalize">{engagement.status}</span>
            <span>Assigned: {engagement.assigned_staff?.display_name ?? "Unassigned"}</span>
            {showStaffRoles && <span>Reviewer: {engagement.reviewer?.display_name ?? "Unassigned"}</span>}
            {engagement.due_date && <span>Due {new Date(engagement.due_date).toLocaleDateString()}</span>}
          </div>
        }
        actions={permissions.engagementsManage && <DeleteEngagementButton engagementId={engagement.id} workspaceId={workspace.id} />}
      />

      <div className="border-b border-border bg-surface px-8 py-3">
        <QuickActions
          engagementId={engagement.id}
          clientId={client?.id ?? ""}
          workspaceId={workspace.id}
          organizerTemplates={organizerTemplates}
          primaryEmail={client?.primary_email ?? null}
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
                {t === "Review" && reviewCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-accentSoft px-1.5 py-0.5 text-[10px] text-accent">{reviewCount}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="px-8 py-6">
            {tab === "Details" && (
              <OverviewTab
                engagement={engagement}
                progress={progress}
                tasks={tasks}
                invoices={invoices}
                timeline={timeline}
                staffOptions={staffOptions}
                organizerResponses={organizerResponses}
                showStaffRoles={showStaffRoles}
                taxDetail={taxDetail}
                taxYears={taxYears}
                workspaceId={workspace.id}
              />
            )}
            {tab === "IRS Notices" && (
              <IrsNoticesPanel workspaceId={workspace.id} entityType="engagement" entityId={engagement.id} notices={irsNotices} />
            )}
            {tab === "Workflow" && <WorkflowTab stages={stages} />}
            {tab === "Tasks" && (
              <TasksTab workspaceId={workspace.id} engagementId={engagement.id} tasks={tasks} staffOptions={staffOptions} />
            )}
            {tab === "Documents" && (
              <DocumentWorkspace
                workspaceId={workspace.id}
                entityType="engagement"
                entityId={engagement.id}
                folders={documentFolders}
                documents={documents}
                requests={documentRequests}
                requestTemplates={documentRequestTemplates}
                signatureRequests={signatureRequests}
                activity={timeline}
                canRequestDocuments={permissions.documentsRequest}
                canRequestSignatures={permissions.signaturesRequest}
              />
            )}
            {tab === "Messages" && (
              <MessagesTab
                workspaceId={workspace.id}
                engagementId={engagement.id}
                primaryEmail={client?.primary_email ?? null}
                primaryPhone={client?.primary_phone ?? null}
                permissions={permissions}
                threads={messageThreads}
                messages={messages}
              />
            )}
            {tab === "Review" && (
              <ReviewTab stages={stages} shares={shares} reviewActions={reviewActions} staffOptions={staffOptions} />
            )}
            {tab === "Billing" && (
              <BillingTab
                clientId={client?.id ?? ""}
                clientName={client ? clientLabel(client) : ""}
                workspaceName={workspace.name}
                workspaceId={workspace.id}
                engagementId={engagement.id}
                canManageBilling={permissions.billingManage}
                quotes={quotes}
                invoices={invoices}
                payments={payments}
              />
            )}
            {tab === "Notes" && <NotesTab engagementId={engagement.id} workspaceId={workspace.id} notes={notes} />}
            {tab === "Audit" && <AuditTab assignmentHistory={assignmentHistory} statusHistory={statusHistory} />}
          </div>
        </div>

        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-border bg-surface p-5 lg:block">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Open tasks</h3>
          {openTasks.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing open.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {openTasks.slice(0, 5).map((t) => (
                <li key={t.id} className="text-sm text-slate">
                  {t.title}
                  {t.due_date && <span className="ml-1 text-xs text-muted">({new Date(t.due_date).toLocaleDateString()})</span>}
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">Progress</h3>
          <p className="mt-2 text-sm text-slate">{progress ? `${Math.round(progress.overall_progress_pct)}%` : "--"}</p>

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
