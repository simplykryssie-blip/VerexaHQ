import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { PaymentLinkButton } from "@/components/PaymentLinkButton";
import { RecordPaymentForm } from "@/components/billing/RecordPaymentForm";
import { PreviewButton } from "@/components/billing/PreviewButton";
import { StatusSelect } from "./StatusSelect";
import { DueDateInput } from "./DueDateInput";
import { TaskRow } from "./TaskRow";
import { AddEngagementNoteForm } from "./AddEngagementNoteForm";
import { AddTaskForm } from "./AddTaskForm";
import { StageReviewActions } from "./StageReviewActions";
import { AssignmentForm } from "./AssignmentForm";

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </div>
      <div className="px-5 py-3">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-slate">{value ?? "--"}</p>
    </div>
  );
}

function money(n: number | null | undefined) {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function staffName(staff: StaffRef) {
  return staff?.display_name ?? "Unassigned";
}

// ---------------------------------------------------------------- Overview

const STATUS_OPTIONS = [
  "New",
  "Waiting On Client",
  "Waiting On Staff",
  "In Progress",
  "Waiting On Review",
  "Corrections Requested",
  "Approved",
  "Waiting On Signature",
  "Waiting On Payment",
  "Ready To Release",
  "Completed",
  "Archived",
];

export function OverviewTab({
  engagement,
  progress,
  tasks,
  invoices,
  timeline,
  staffOptions,
  organizerResponses,
}: {
  engagement: EngagementRow;
  progress: ProgressRow | null;
  tasks: TaskRow[];
  invoices: InvoiceRow[];
  timeline: ActivityRow[];
  staffOptions: StaffOption[];
  organizerResponses: OrganizerResponseRow[];
}) {
  const openTasks = tasks.filter((t) => t.status !== "completed");
  const outstandingInvoices = invoices.filter((i) => i.status !== "paid" && i.status !== "void" && i.status !== "draft");
  const client = engagement.clients;

  return (
    <div className="space-y-6">
      <Section title="Status & progress">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Status</p>
            <div className="mt-1">
              <StatusSelect engagementId={engagement.id} currentStatus={engagement.status} options={STATUS_OPTIONS} />
            </div>
          </div>
          <Field label="Priority" value={engagement.priority} />
          <Field label="Review status" value={engagement.review_status} />
          <Field label="Open date" value={engagement.open_date ? new Date(engagement.open_date).toLocaleDateString() : null} />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Engagement due date</p>
            <div className="mt-1">
              <DueDateInput engagementId={engagement.id} currentDueDate={engagement.due_date} />
            </div>
          </div>
          <Field
            label="Completed date"
            value={engagement.completed_date ? new Date(engagement.completed_date).toLocaleDateString() : null}
          />
        </div>

        {progress && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ProgressBar label="Overall progress" pct={progress.overall_progress_pct} />
            <ProgressBar label="Task progress" pct={progress.task_progress_pct} />
            <ProgressBar label="Document progress" pct={progress.document_progress_pct} />
          </div>
        )}
      </Section>

      <Section title="Assignments">
        <AssignmentForm
          engagementId={engagement.id}
          assignedStaff={engagement.assigned_staff}
          reviewer={engagement.reviewer}
          complianceOfficer={engagement.compliance_officer}
          clientDefaults={{
            relationship_manager: client?.relationship_manager_id ? { id: client.relationship_manager_id, display_name: null } : null,
            default_reviewer: client?.default_reviewer_id ? { id: client.default_reviewer_id, display_name: null } : null,
            default_compliance_officer: client?.default_compliance_officer_id
              ? { id: client.default_compliance_officer_id, display_name: null }
              : null,
          }}
          staffOptions={staffOptions}
        />
      </Section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Open tasks</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{openTasks.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Outstanding invoices</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{outstandingInvoices.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Client</p>
          <p className="mt-1 text-lg font-semibold text-ink">
            {client ? (
              <Link href={`/clients/${client.id}`} className="text-accent hover:underline">
                {clientLabel(client)}
              </Link>
            ) : (
              "--"
            )}
          </p>
        </div>
      </div>

      <Section title="Organizers">
        {organizerResponses.length === 0 ? (
          <EmptyState message="No organizer sent yet -- use Send Organizer above to assign one." />
        ) : (
          <ul className="divide-y divide-border">
            {organizerResponses.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate">{o.template_name}</span>
                <span className="capitalize text-muted">
                  {o.status.replace("_", " ")}
                  {o.submitted_at && ` -- submitted ${new Date(o.submitted_at).toLocaleDateString()}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recent activity">
        {timeline.length === 0 ? (
          <EmptyState message="No activity recorded yet." />
        ) : (
          <ul className="space-y-2">
            {timeline.slice(0, 8).map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-slate">{a.description}</span>
                <span className="text-xs text-muted">{new Date(a.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function ProgressBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surfaceMuted">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">{Math.round(pct)}%</p>
    </div>
  );
}

function clientLabel(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null }) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

// -------------------------------------------------------------------- Workflow

export function WorkflowTab({ stages }: { stages: StageRow[] }) {
  return (
    <Section title="Workflow stages">
      {stages.length === 0 ? (
        <EmptyState message="No workflow started yet for this engagement." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">SLA</th>
                <th className="px-4 py-2 font-medium">Reviewer</th>
                <th className="px-4 py-2 font-medium">Due date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stages.map((s) => (
                <tr key={s.id} className="hover:bg-surfaceMuted">
                  <td className="px-4 py-2 font-medium text-ink">{s.stage_name}</td>
                  <td className="px-4 py-2 text-slate">{s.status}</td>
                  <td className="px-4 py-2">
                    {s.sla_category && <SlaBadge category={s.sla_category} />}
                  </td>
                  <td className="px-4 py-2 text-slate">{staffName(s.reviewer)}</td>
                  <td className="px-4 py-2 text-slate">{s.due_date ? new Date(s.due_date).toLocaleDateString() : "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function SlaBadge({ category }: { category: string }) {
  const styles: Record<string, string> = {
    "On Track": "bg-green-50 text-green-700",
    Completed: "bg-surfaceMuted text-muted",
    Overdue: "bg-red-50 text-danger",
    Exceeded: "bg-amber-50 text-amber-700",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[category] ?? "bg-surfaceMuted text-muted"}`}>
      {category}
    </span>
  );
}

// ----------------------------------------------------------------- Tasks

export function TasksTab({
  workspaceId,
  engagementId,
  tasks,
  staffOptions,
}: {
  workspaceId: string;
  engagementId: string;
  tasks: TaskRow[];
  staffOptions: StaffOption[];
}) {
  return (
    <Section
      title="Tasks"
      action={<AddTaskForm workspaceId={workspaceId} engagementId={engagementId} tasks={tasks} staffOptions={staffOptions} />}
    >
      {tasks.length === 0 ? (
        <EmptyState message="No tasks yet." />
      ) : (
        <ul className="divide-y divide-border">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      )}
    </Section>
  );
}

// -------------------------------------------------------------- Messages

export function MessagesTab({ threads, messages }: { threads: MessageThreadRow[]; messages: MessageRow[] }) {
  return (
    <Section title="Message threads">
      {threads.length === 0 ? (
        <EmptyState message="No messages yet -- use Send Message to start a thread." />
      ) : (
        <ul className="space-y-4">
          {threads.map((t) => {
            const threadMessages = messages.filter((m) => m.thread_id === t.id);
            return (
              <li key={t.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">{t.subject ?? "Message"}</span>
                  <span className="text-xs uppercase tracking-wide text-muted">{t.channel}</span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {threadMessages.map((m) => (
                    <li key={m.id} className="text-sm text-slate">
                      <span className={m.is_internal ? "italic text-muted" : ""}>{m.body}</span>
                      <span className="ml-2 text-xs text-muted">{new Date(m.created_at).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- Review

export function ReviewTab({ stages, shares, reviewActions, staffOptions }: { stages: StageRow[]; shares: ShareRow[]; reviewActions: ReviewActionRow[]; staffOptions: StaffOption[] }) {
  const pendingStages = stages.filter((s) => s.status === "Waiting" || s.status === "In Progress");

  return (
    <div className="space-y-6">
      <Section title="Awaiting review">
        {pendingStages.length === 0 ? (
          <EmptyState message="Nothing awaiting review." />
        ) : (
          <ul className="divide-y divide-border">
            {pendingStages.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium text-ink">{s.stage_name}</p>
                  <p className="text-xs text-muted">Reviewer: {staffName(s.reviewer)}</p>
                </div>
                <StageReviewActions stageId={s.id} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {shares.length > 0 && (
        <Section title="Shared with other workspaces">
          <ul className="divide-y divide-border">
            {shares.map((s) => (
              <li key={s.id} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate">{s.shared_with?.name ?? "Workspace"}</span>
                  <span className="capitalize text-muted">{s.status}</span>
                </div>
                {reviewActions
                  .filter((r) => r.engagement_share_id === s.id)
                  .map((r) => {
                    const actor = staffOptions.find((o) => o.id === r.actor_id);
                    return (
                      <p key={r.id} className="mt-1 text-xs text-muted">
                        {actor?.display_name ?? "Someone"} {r.action} -- {new Date(r.created_at).toLocaleString()}
                        {r.comment ? `: ${r.comment}` : ""}
                      </p>
                    );
                  })}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// --------------------------------------------------------------- Billing

export function BillingTab({
  clientId,
  clientName,
  workspaceName,
  workspaceId,
  canManageBilling,
  quotes,
  invoices,
  payments,
}: {
  clientId: string;
  clientName: string;
  workspaceName: string;
  workspaceId: string;
  canManageBilling: boolean;
  quotes: QuoteRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
}) {
  return (
    <div className="space-y-6">
      <Section title="Quotes">
        {quotes.length === 0 ? (
          <EmptyState message="No quotes yet." />
        ) : (
          <ul className="divide-y divide-border">
            {quotes.map((q) => (
              <li key={q.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate">
                  {q.quote_number} -- {q.title}
                </span>
                <div className="flex items-center gap-3">
                  <span className="capitalize text-muted">
                    {q.status} -- {money(q.total_amount)}
                  </span>
                  <PreviewButton
                    kind="quote"
                    firmName={workspaceName}
                    clientName={clientName}
                    number={q.quote_number}
                    issueDate={q.created_at}
                    dueDate={q.valid_until}
                    lineItems={q.line_items ?? []}
                    subtotal={q.subtotal}
                    discountAmount={q.discount_amount}
                    taxAmount={q.tax_amount}
                    totalAmount={q.total_amount}
                    notes={q.notes}
                    status={q.status}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Invoices">
        {invoices.length === 0 ? (
          <EmptyState message="No invoices yet." />
        ) : (
          <ul className="divide-y divide-border">
            {invoices.map((i) => {
              const isOutstanding = i.status !== "paid" && i.status !== "void" && i.status !== "draft";
              return (
                <li key={i.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate">{i.invoice_number ?? "Invoice"}</span>
                    <div className="flex items-center gap-3">
                      <span className="capitalize text-muted">
                        {i.status} -- {money(i.total_amount)} ({money(i.amount_paid)} paid)
                      </span>
                      <PreviewButton
                        kind="invoice"
                        firmName={workspaceName}
                        clientName={clientName}
                        number={i.invoice_number}
                        issueDate={i.issue_date}
                        dueDate={i.due_date}
                        lineItems={i.line_items ?? []}
                        subtotal={i.subtotal}
                        discountAmount={i.discount_amount}
                        taxAmount={i.tax_amount}
                        totalAmount={i.total_amount}
                        notes={i.notes}
                        status={i.status}
                      />
                      {isOutstanding && <PaymentLinkButton invoiceId={i.id} />}
                    </div>
                  </div>
                  {isOutstanding && canManageBilling && (
                    <div className="mt-2">
                      <RecordPaymentForm
                        invoiceId={i.id}
                        workspaceId={workspaceId}
                        clientId={clientId}
                        balanceDue={i.total_amount - i.amount_paid}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Payments">
        {payments.length === 0 ? (
          <EmptyState message="No payments recorded yet." />
        ) : (
          <ul className="divide-y divide-border">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate">{new Date(p.payment_date).toLocaleDateString()}</span>
                <span className="capitalize text-muted">
                  {p.status} -- {money(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// -------------------------------------------------------------- Timeline

export function TimelineTab({ timeline }: { timeline: ActivityRow[] }) {
  return (
    <Section title="Timeline">
      {timeline.length === 0 ? (
        <EmptyState message="No activity recorded yet." />
      ) : (
        <ul className="space-y-3">
          {timeline.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm">
              <span className="text-slate">{a.description}</span>
              <span className="text-xs text-muted">{new Date(a.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ----------------------------------------------------------------- Notes

export function NotesTab({ engagementId, workspaceId, notes }: { engagementId: string; workspaceId: string; notes: NoteRow[] }) {
  const pinned = notes.filter((n) => n.is_pinned);
  const rest = notes.filter((n) => !n.is_pinned);
  return (
    <Section title="Notes" action={<AddEngagementNoteForm engagementId={engagementId} workspaceId={workspaceId} />}>
      {notes.length === 0 ? (
        <EmptyState message="No notes yet." />
      ) : (
        <ul className="space-y-3">
          {[...pinned, ...rest].map((n) => (
            <li key={n.id} className="rounded-lg bg-surfaceMuted p-3 text-sm text-slate">
              {n.is_pinned && <span className="mr-2 text-xs font-medium text-accent">Pinned</span>}
              {n.is_internal && <span className="mr-2 text-xs font-medium text-muted">Internal</span>}
              {n.subject && <p className="font-semibold text-ink">{n.subject}</p>}
              <p>{n.body}</p>
              <p className="mt-1 text-xs text-muted">{new Date(n.created_at).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ----------------------------------------------------------------- Audit

export function AuditTab({ assignmentHistory, statusHistory }: { assignmentHistory: AssignmentHistoryRow[]; statusHistory: StatusHistoryRow[] }) {
  return (
    <div className="space-y-6">
      <Section title="Status history">
        {statusHistory.length === 0 ? (
          <EmptyState message="No status changes recorded yet." />
        ) : (
          <ul className="divide-y divide-border">
            {statusHistory.map((h) => (
              <li key={h.id} className="py-2 text-sm text-slate">
                {h.old_status ?? "(none)"} &rarr; {h.new_status}
                <span className="ml-2 text-xs text-muted">{h.changed_at ? new Date(h.changed_at).toLocaleString() : ""}</span>
                {h.reason && <p className="text-xs text-muted">{h.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Assignment history">
        {assignmentHistory.length === 0 ? (
          <EmptyState message="No assignment changes recorded yet." />
        ) : (
          <ul className="divide-y divide-border">
            {assignmentHistory.map((h) => (
              <li key={h.id} className="py-2 text-sm text-slate">
                <span className="capitalize">{h.assignment_role.replace(/_/g, " ")}</span>: {staffName(h.previous_user)} &rarr;{" "}
                {staffName(h.new_user)}
                <span className="ml-2 text-xs text-muted">{new Date(h.changed_at).toLocaleString()}</span>
                {h.reason && <p className="text-xs text-muted">{h.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------- Types

export type StaffRef = { id: string; display_name: string | null } | null;
export type StaffOption = { id: string; display_name: string | null };
export type ClientRef = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  client_type: string;
  relationship_manager_id: string | null;
  default_reviewer_id: string | null;
  default_compliance_officer_id: string | null;
  primary_email: string | null;
  primary_phone: string | null;
};
export type EngagementRow = {
  id: string;
  engagement_number: string | null;
  status: string;
  priority: string | null;
  review_status: string | null;
  due_date: string | null;
  open_date: string | null;
  completed_date: string | null;
  clients: ClientRef | null;
  engagement_types: { name: string } | null;
  assigned_staff: StaffRef;
  reviewer: StaffRef;
  compliance_officer: StaffRef;
};
export type ProgressRow = { task_progress_pct: number; document_progress_pct: number; overall_progress_pct: number; workflow_status: string | null };
export type StageRow = {
  id: string;
  stage_name: string;
  status: string;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  reviewer: StaffRef;
  sla_category: string | null;
};
export type TaskDependency = { id: string; depends_on_task_id: string; depends_on_title: string };
export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  completed_at: string | null;
  assigned_staff: StaffRef;
  dependencies: TaskDependency[];
};
export type NoteRow = { id: string; subject: string | null; body: string; is_pinned: boolean; is_internal: boolean; is_private: boolean; created_at: string };
export type MessageThreadRow = { id: string; subject: string | null; channel: string };
export type MessageRow = { id: string; thread_id: string; body: string; is_internal: boolean; created_at: string };
export type ShareRow = { id: string; status: string; shared_with: { name: string } | null };
export type ReviewActionRow = { id: string; engagement_share_id: string; action: string; comment: string | null; created_at: string; actor_id: string | null };
export type AssignmentHistoryRow = { id: string; assignment_role: string; previous_user: StaffRef; new_user: StaffRef; changed_at: string; reason: string | null };
export type StatusHistoryRow = { id: string; old_status: string | null; new_status: string; changed_at: string | null; reason: string | null };
export type QuoteRow = {
  id: string;
  quote_number: string | null;
  title: string;
  status: string;
  total_amount: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  line_items: { description: string; quantity: number; unit_price: number }[];
  created_at: string;
  valid_until: string | null;
  notes: string | null;
};
export type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: string;
  total_amount: number;
  amount_paid: number;
  due_date: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  line_items: { description: string; quantity: number; unit_price: number }[];
  issue_date: string | null;
  notes: string | null;
};
export type PaymentRow = { id: string; status: string; amount: number; payment_date: string };
export type ActivityRow = { id: string; description: string; activity_type: string; created_at: string };
export type OrganizerResponseRow = { id: string; status: string; submitted_at: string | null; template_name: string };
