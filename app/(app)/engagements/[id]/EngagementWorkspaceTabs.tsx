"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { PaymentLinkButton } from "@/components/PaymentLinkButton";
import { RefundButton } from "@/components/billing/RefundButton";
import { RecordPaymentForm } from "@/components/billing/RecordPaymentForm";
import { PreviewButton } from "@/components/billing/PreviewButton";
import { InvoiceQuoteForm } from "@/components/billing/InvoiceQuoteForm";
import { StatusSelect } from "./StatusSelect";
import { DueDateInput } from "./DueDateInput";
import { TaskRow } from "./TaskRow";
import { AddEngagementNoteForm, EditEngagementNoteForm } from "./AddEngagementNoteForm";
import { AddTaskForm } from "./AddTaskForm";
import { StageReviewActions } from "./StageReviewActions";
import { EfileDecisionActions } from "./EfileDecisionActions";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { AssignmentForm } from "./AssignmentForm";
import { TaxDetailsCard, type TaxDetailRow } from "@/components/tax/TaxDetailsCard";
import { OrganizerResponseCard } from "@/components/organizer/OrganizerResponseCard";
import type { ActionPermissions } from "@/lib/actionPermissions";
import { ENGAGEMENT_STATUS_OPTIONS } from "@/lib/engagementStatus";
import { BILLING_DOCUMENT_STATUS_TONE, PAYMENT_STATUS_TONE } from "@/lib/billingStatus";
import { SectionCard as Section, Field } from "@/components/ui/SectionCard";

function money(n: number | null | undefined) {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function staffName(staff: StaffRef) {
  return staff?.display_name ?? "Unassigned";
}

// ---------------------------------------------------------------- Overview

const STATUS_OPTIONS = ENGAGEMENT_STATUS_OPTIONS;

export function OverviewTab({
  engagement,
  progress,
  tasks,
  invoices,
  timeline,
  staffOptions,
  organizerResponses,
  showStaffRoles = true,
  taxDetail,
  taxYears,
  workspaceId,
}: {
  engagement: EngagementRow;
  progress: ProgressRow | null;
  tasks: TaskRow[];
  invoices: InvoiceRow[];
  timeline: ActivityRow[];
  staffOptions: StaffOption[];
  organizerResponses: OrganizerResponseRow[];
  showStaffRoles?: boolean;
  taxDetail: TaxDetailRow;
  taxYears: number[];
  workspaceId: string;
}) {
  const openTasks = tasks.filter((t) => t.status !== "completed");
  const outstandingInvoices = invoices.filter((i) => i.status !== "paid" && i.status !== "void" && i.status !== "draft");
  const client = engagement.clients;
  // "other" (the default for engagements created before case_type existed,
  // or with no categorized service) still shows tax fields since we can't
  // tell what kind of work it actually is -- only definitively non-tax
  // types hide them.
  const showTaxDetails = engagement.case_type !== "bookkeeping" && engagement.case_type !== "payroll" && engagement.case_type !== "business_service";

  return (
    <div className="space-y-6">
      {showTaxDetails && <TaxDetailsCard engagementId={engagement.id} workspaceId={workspaceId} detail={taxDetail} taxYears={taxYears} />}

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
            <p className="text-xs uppercase tracking-wide text-muted">IRS due date / deadline</p>
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
          showReviewAndCompliance={showStaffRoles}
        />
      </Section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Open tasks</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{openTasks.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Outstanding invoices</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{outstandingInvoices.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
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
          <div className="space-y-3">
            {organizerResponses.map((o) => (
              <OrganizerResponseCard key={o.id} response={o} />
            ))}
          </div>
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

export function WorkflowTab({ stages, engagementId, workspaceId }: { stages: StageRow[]; engagementId: string; workspaceId: string }) {
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
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stages.map((s) => (
                <tr key={s.id} className="transition-colors hover:bg-surfaceMuted">
                  <td className="px-4 py-2.5 font-medium text-ink">{s.stage_name}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STAGE_STATUS_TONE[s.status] ?? "neutral"}>{s.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {s.sla_category && <SlaBadge category={s.sla_category} />}
                  </td>
                  <td className="px-4 py-2.5 text-slate">{staffName(s.reviewer)}</td>
                  <td className="px-4 py-2.5 text-slate">{s.due_date ? new Date(s.due_date).toLocaleDateString() : "--"}</td>
                  <td className="px-4 py-2.5">
                    {s.status !== "Completed" &&
                      s.status !== "Skipped" &&
                      (s.stage_name === "Filed / Awaiting Acceptance" ? (
                        <EfileDecisionActions stageId={s.id} engagementId={engagementId} workspaceId={workspaceId} />
                      ) : (
                        <StageReviewActions stageId={s.id} />
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

const SLA_TONE: Record<string, BadgeTone> = {
  "On Track": "success",
  Completed: "neutral",
  Overdue: "danger",
  Exceeded: "warning",
};

const STAGE_STATUS_TONE: Record<string, BadgeTone> = {
  Waiting: "warning",
  "In Progress": "accent",
  Completed: "success",
  Skipped: "neutral",
};

const SHARE_STATUS_TONE: Record<string, BadgeTone> = {
  pending: "warning",
  corrections_requested: "danger",
  approved: "success",
};

function SlaBadge({ category }: { category: string }) {
  return <Badge tone={SLA_TONE[category] ?? "neutral"}>{category}</Badge>;
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

// Same unified GHL-style conversation as the client workspace's Messages
// tab -- see that file for the fuller explanation. Threads stay separate
// rows underneath (channel is thread-level); sending reuses the existing
// non-document-request thread for the chosen channel or creates it on
// first use, so the stream reads as continuous without a data migration.
export function MessagesTab({
  workspaceId,
  engagementId,
  primaryEmail,
  primaryPhone,
  permissions,
  threads,
  messages,
}: {
  workspaceId: string;
  engagementId: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  permissions: Pick<ActionPermissions, "messagesSend" | "messagesInternalNote">;
  threads: MessageThreadRow[];
  messages: MessageRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);

  const channelOptions = [
    ...(permissions.messagesSend
      ? [
          { value: "portal", label: "Portal" },
          { value: "email", label: primaryEmail ? `Email (${primaryEmail})` : "Email -- no email on file" },
          { value: "sms", label: primaryPhone ? `SMS (${primaryPhone})` : "SMS -- no phone on file" },
        ]
      : []),
    ...(permissions.messagesInternalNote ? [{ value: "internal", label: "Internal note" }] : []),
  ];

  const [channel, setChannel] = useState(channelOptions[0]?.value ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const threadsById = new Map(threads.map((t) => [t.id, t]));
  const existingEmailThread = threads.find((t) => t.channel === "email" && !t.subject?.startsWith("Document request:"));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (channel === "email") setSubject(existingEmailThread?.subject ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  async function send() {
    setError(null);
    const isInternal = channel === "internal";
    if (channel === "email" && !primaryEmail) {
      setError("No email on file -- add one on the client first.");
      return;
    }
    if (channel === "sms" && !primaryPhone) {
      setError("No phone number on file -- add one on the client first.");
      return;
    }
    if (!body.trim()) return;
    setSending(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const existingThread = threads.find((t) => t.channel === channel && !t.subject?.startsWith("Document request:"));
    let threadId = existingThread?.id;
    const resolvedSubject = channel === "email" ? subject.trim() || "Message" : isInternal ? "Internal note" : "Message";

    if (!threadId) {
      const { data: thread, error: threadError } = await supabase
        .from("message_threads")
        .insert({
          workspace_id: workspaceId,
          entity_type: "engagement",
          entity_id: engagementId,
          channel,
          subject: resolvedSubject,
          created_by: user?.id,
        })
        .select("id")
        .single();
      if (threadError || !thread) {
        setSending(false);
        setError(threadError?.message ?? "Could not create thread.");
        return;
      }
      threadId = thread.id;
    } else if (channel === "email" && subject.trim() && subject.trim() !== existingThread?.subject) {
      await supabase.from("message_threads").update({ subject: resolvedSubject }).eq("id", threadId);
    }

    const { error: messageError } = await supabase.from("messages").insert({
      workspace_id: workspaceId,
      thread_id: threadId,
      sender_type: "staff",
      sender_id: user?.id,
      body,
      is_internal: isInternal,
    });
    if (messageError) {
      setSending(false);
      setError(messageError.message);
      return;
    }

    if (channel === "email" && primaryEmail) {
      try {
        const res = await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: primaryEmail, subject: resolvedSubject, html: `<p>${body}</p>` }),
        });
        const data = (await res.json()) as { sent?: boolean; reason?: string; error?: string };
        if (!data.sent) toast.show(`Message saved, but the email wasn't delivered: ${data.reason ?? data.error ?? "unknown error"}`, "error");
      } catch {
        toast.show("Message saved, but the email wasn't delivered.", "error");
      }
    } else if (channel === "sms" && primaryPhone) {
      try {
        const res = await fetch("/api/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: primaryPhone, body }),
        });
        const data = (await res.json()) as { sent?: boolean; reason?: string; error?: string };
        if (!data.sent) toast.show(`Message saved, but the SMS wasn't delivered: ${data.reason ?? data.error ?? "unknown error"}`, "error");
      } catch {
        toast.show("Message saved, but the SMS wasn't delivered.", "error");
      }
    }

    setBody("");
    setSending(false);
    router.refresh();
  }

  return (
    <div className="flex h-[calc(100vh-260px)] flex-col rounded-2xl border border-border bg-surface shadow-soft">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <EmptyState message="No messages yet -- send one below to start the conversation." />
        ) : (
          messages.map((m) => {
            const thread = threadsById.get(m.thread_id);
            const isDocumentRequest = thread?.subject?.startsWith("Document request:");

            if (m.is_internal) {
              return (
                <div key={m.id} className="mx-auto max-w-lg rounded-lg bg-warning/10 px-3 py-2 text-center">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-warning">Internal note</span>
                  <p className="mt-1 text-sm text-slate">{m.body}</p>
                  <span className="mt-1 block text-[11px] text-muted">{new Date(m.created_at).toLocaleString()}</span>
                </div>
              );
            }

            const fromStaff = m.sender_type === "staff";
            return (
              <div key={m.id} className={`flex ${fromStaff ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${fromStaff ? "bg-accent text-white" : "bg-surfaceMuted text-slate"}`}>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <div className={`mt-1 flex flex-wrap items-center gap-2 text-[11px] ${fromStaff ? "text-white/70" : "text-muted"}`}>
                    <span className="uppercase tracking-wide">{thread?.channel ?? "portal"}</span>
                    <span>{new Date(m.created_at).toLocaleString()}</span>
                    {isDocumentRequest && <span className={`font-medium ${fromStaff ? "text-white" : "text-accent"}`}>Document request</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {channelOptions.length > 0 && (
        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="rounded-lg border border-border px-2 py-1.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {channelOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
          {channel === "email" && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <label className="font-medium text-muted">Subject</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Message"
                className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          )}
          <div className="mt-2 flex items-end gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Type a message... (Enter for a new line, Cmd/Ctrl+Enter to send)"
              rows={channel === "email" ? 6 : 2}
              className="flex-1 resize-none rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="button"
              disabled={sending || !body.trim()}
              onClick={send}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Review

export function ReviewTab({
  engagementId,
  stages,
  shares,
  reviewActions,
  staffOptions,
  canShare,
}: {
  engagementId: string;
  stages: StageRow[];
  shares: ShareRow[];
  reviewActions: ReviewActionRow[];
  staffOptions: StaffOption[];
  canShare: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pendingStages = stages.filter((s) => s.status === "Waiting" || s.status === "In Progress");
  const activeShare = shares.find((s) => s.status === "pending" || s.status === "corrections_requested");

  async function shareWithEro() {
    setBusy(true);
    const { error } = await supabase.rpc("create_engagement_share", { p_engagement_id: engagementId });
    setBusy(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Shared with your ERO for review.", "success");
    router.refresh();
  }

  async function resubmit(shareId: string) {
    setBusy(true);
    const { error } = await supabase.rpc("resubmit_engagement_share", { p_engagement_share_id: shareId });
    setBusy(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Resubmitted for review.", "success");
    router.refresh();
  }

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

      {canShare && (
        <Section title="Share with your ERO">
          {activeShare ? (
            <div className="flex items-center justify-between rounded-lg bg-surfaceMuted p-3 text-sm">
              <span className="text-slate">
                {activeShare.status === "corrections_requested" ? "Your ERO requested corrections." : "Waiting on your ERO's review."}
              </span>
              {activeShare.status === "corrections_requested" && (
                <button
                  type="button"
                  onClick={() => resubmit(activeShare.id)}
                  disabled={busy}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
                >
                  Resubmit
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg bg-surfaceMuted p-3 text-sm">
              <span className="text-slate">Once this engagement is ready for filing, share it with your ERO for approval.</span>
              <button
                type="button"
                onClick={shareWithEro}
                disabled={busy}
                className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
              >
                {busy ? "Sharing..." : "Share with ERO"}
              </button>
            </div>
          )}
        </Section>
      )}

      {shares.length > 0 && (
        <Section title="Shared with other workspaces">
          <ul className="divide-y divide-border">
            {shares.map((s) => (
              <li key={s.id} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate">{s.shared_with?.name ?? "Workspace"}</span>
                  <Badge tone={SHARE_STATUS_TONE[s.status] ?? "neutral"} className="capitalize">
                    {s.status.replace(/_/g, " ")}
                  </Badge>
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
  engagementId,
  canManageBilling,
  quotes,
  invoices,
  payments,
}: {
  clientId: string;
  clientName: string;
  workspaceName: string;
  workspaceId: string;
  engagementId: string;
  canManageBilling: boolean;
  quotes: QuoteRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
}) {
  const [modal, setModal] = useState<"invoice" | "quote" | null>(null);
  const [editingQuote, setEditingQuote] = useState<QuoteRow | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRow | null>(null);

  return (
    <div className="space-y-6">
      {canManageBilling && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setModal("quote")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
          >
            + Create Quote
          </button>
          <button
            type="button"
            onClick={() => setModal("invoice")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90"
          >
            + Create Invoice
          </button>
        </div>
      )}

      {modal && (
        <Modal title={modal === "invoice" ? "Create invoice" : "Create quote"} onClose={() => setModal(null)} size="xl">
          <InvoiceQuoteForm
            kind={modal}
            workspaceId={workspaceId}
            clientId={clientId}
            engagementId={engagementId}
            firmName={workspaceName}
            clientName={clientName}
            onDone={() => setModal(null)}
          />
        </Modal>
      )}

      {editingQuote && (
        <Modal title="Edit quote" onClose={() => setEditingQuote(null)} size="xl">
          <InvoiceQuoteForm
            kind="quote"
            workspaceId={workspaceId}
            clientId={clientId}
            engagementId={engagementId}
            firmName={workspaceName}
            clientName={clientName}
            editing={{
              id: editingQuote.id,
              title: editingQuote.title,
              line_items: editingQuote.line_items ?? [],
              discount_amount: editingQuote.discount_amount,
              tax_amount: editingQuote.tax_amount,
              subtotal: editingQuote.subtotal,
              valid_until: editingQuote.valid_until,
              notes: editingQuote.notes,
            }}
            onDone={() => setEditingQuote(null)}
          />
        </Modal>
      )}

      {editingInvoice && (
        <Modal title="Edit invoice" onClose={() => setEditingInvoice(null)} size="xl">
          <InvoiceQuoteForm
            kind="invoice"
            workspaceId={workspaceId}
            clientId={clientId}
            engagementId={engagementId}
            firmName={workspaceName}
            clientName={clientName}
            editing={{
              id: editingInvoice.id,
              line_items: editingInvoice.line_items ?? [],
              discount_amount: editingInvoice.discount_amount,
              tax_amount: editingInvoice.tax_amount,
              subtotal: editingInvoice.subtotal,
              due_date: editingInvoice.due_date,
              notes: editingInvoice.notes,
            }}
            onDone={() => setEditingInvoice(null)}
          />
        </Modal>
      )}

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
                  <span className="flex items-center gap-2 text-muted">
                    <Badge tone={BILLING_DOCUMENT_STATUS_TONE[q.status] ?? "neutral"} className="capitalize">
                      {q.status}
                    </Badge>
                    {money(q.total_amount)}
                  </span>
                  {canManageBilling && (
                    <button
                      type="button"
                      onClick={() => setEditingQuote(q)}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      Edit
                    </button>
                  )}
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
                      <span className="flex items-center gap-2 text-muted">
                        <Badge tone={BILLING_DOCUMENT_STATUS_TONE[i.status] ?? "neutral"} className="capitalize">
                          {i.status}
                        </Badge>
                        {money(i.total_amount)} ({money(i.amount_paid)} paid)
                      </span>
                      {canManageBilling && i.status !== "paid" && i.status !== "void" && (
                        <button
                          type="button"
                          onClick={() => setEditingInvoice(i)}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          Edit
                        </button>
                      )}
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
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-2 text-muted">
                    <Badge tone={PAYMENT_STATUS_TONE[p.status] ?? "neutral"} className="capitalize">
                      {p.status}
                    </Badge>
                    {money(p.amount)}
                  </span>
                  {canManageBilling && p.status !== "refunded" && p.stripe_payment_intent_id && (
                    <RefundButton paymentId={p.id} amount={p.amount} />
                  )}
                </div>
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
              <div className="flex items-start justify-between gap-2">
                <div>
                  {n.is_pinned && <span className="mr-2 text-xs font-medium text-accent">Pinned</span>}
                  {n.is_internal && <span className="mr-2 text-xs font-medium text-muted">Internal</span>}
                  {n.subject && <p className="font-semibold text-ink">{n.subject}</p>}
                </div>
                <EditEngagementNoteForm note={n} />
              </div>
              <p className="whitespace-pre-wrap">{n.body}</p>
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
  case_type: string;
  clients: ClientRef | null;
  services: { name: string } | null;
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
export type MessageRow = {
  id: string;
  thread_id: string;
  body: string;
  is_internal: boolean;
  sender_type: string;
  created_at: string;
};
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
export type PaymentRow = { id: string; status: string; amount: number; payment_date: string; stripe_payment_intent_id: string | null };
export type ActivityRow = { id: string; description: string; activity_type: string; created_at: string };
import type {
  OrganizerFieldAnswer,
  OrganizerRepeaterGroup,
  OrganizerResponseDetail as OrganizerResponseRow,
} from "@/components/organizer/OrganizerResponseCard";
export type { OrganizerFieldAnswer, OrganizerRepeaterGroup, OrganizerResponseRow };
