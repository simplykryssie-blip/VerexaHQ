"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, HelpCircle, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/EmptyState";
import { OrganizerAnswerReveal } from "@/components/organizer/OrganizerAnswerReveal";
import { RequestsPanel } from "@/components/documents/RequestsPanel";
import type { DocumentRequestRow, DocumentRequestTemplateOption, EntityType } from "@/components/documents/types";
import type { ReviewQuestionItem, ReviewQuestionStatus, ReviewSection, OrganizerReviewStatus } from "@/lib/organizer/buildReviewSections";
import { NeedsInfoModal } from "./NeedsInfoModal";

type InfoRequestRow = {
  id: string;
  organizer_field_id: string | null;
  message: string;
  status: "active" | "viewed" | "responded" | "resolved";
  sent_via_email: boolean;
  sent_via_sms: boolean;
  shown_in_portal: boolean;
  created_at: string;
  viewed_at: string | null;
  responded_at: string | null;
  resolved_at: string | null;
};

type NoteRow = { id: string; subject: string | null; body: string; author_id: string | null; created_at: string; authorName: string };
type StaffOption = { id: string; display_name: string | null };
type ActivityRow = { id: string; description: string; activity_type: string; created_at: string };

type ResponseInfo = {
  id: string;
  status: string;
  submittedAt: string | null;
  templateName: string;
  reviewStatus: OrganizerReviewStatus | null;
  assignedReviewerId: string | null;
  clientId: string;
  engagementId: string | null;
};

const QUESTION_STATUS_LABEL: Record<ReviewQuestionStatus, string> = {
  not_applicable: "Not applicable",
  unanswered: "Unanswered",
  optional_blank: "Not answered",
  needs_review: "Needs review",
  Pending: "Pending",
  "In Review": "In review",
  Approved: "Approved",
  Rejected: "Denied",
  "Corrections Requested": "Needs info",
};

const QUESTION_STATUS_TONE: Record<ReviewQuestionStatus, BadgeTone> = {
  not_applicable: "neutral",
  unanswered: "danger",
  optional_blank: "neutral",
  needs_review: "accent",
  Pending: "neutral",
  "In Review": "accent",
  Approved: "success",
  Rejected: "danger",
  "Corrections Requested": "warning",
};

const RESPONSE_STATUS_TONE: Record<OrganizerReviewStatus, BadgeTone> = {
  Pending: "neutral",
  "In Review": "accent",
  Approved: "success",
  Rejected: "danger",
  "Corrections Requested": "warning",
};

function sectionTone(section: ReviewSection): BadgeTone {
  if (section.attentionCount > 0) return "danger";
  if (section.totalVisible === 0) return "neutral";
  if (section.allDecided) return "success";
  return "accent";
}

export function ReviewWorkspace({
  workspaceId,
  response,
  clientName,
  clientEmail,
  engagementNumber,
  taxYear,
  sections,
  infoRequests: initialInfoRequests,
  notes: initialNotes,
  documentRequests,
  documentRequestTemplates,
  entityType,
  entityId,
  activity,
  staffOptions,
}: {
  workspaceId: string;
  response: ResponseInfo;
  clientName: string;
  clientEmail: string | null;
  engagementNumber: string | null;
  taxYear: number | null;
  sections: ReviewSection[];
  infoRequests: InfoRequestRow[];
  notes: NoteRow[];
  documentRequests: DocumentRequestRow[];
  documentRequestTemplates: DocumentRequestTemplateOption[];
  entityType: EntityType;
  entityId: string;
  activity: ActivityRow[];
  staffOptions: StaffOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? "general");
  const [busyAnswerId, setBusyAnswerId] = useState<string | null>(null);
  const [busyResponse, setBusyResponse] = useState(false);
  const [needsInfoTarget, setNeedsInfoTarget] = useState<{ fieldId: string | null; label: string | null } | null>(null);
  const [assignedReviewerId, setAssignedReviewerId] = useState(response.assignedReviewerId ?? "");
  const [infoRequests, setInfoRequests] = useState(initialInfoRequests);
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [notes] = useState(initialNotes);
  const [collapsedHidden, setCollapsedHidden] = useState(true);

  const activeSection = sections.find((s) => s.id === activeSectionId) ?? sections[0];

  const totalAttention = sections.reduce((sum, s) => sum + s.attentionCount, 0);
  const totalVisible = sections.reduce((sum, s) => sum + s.totalVisible, 0);
  const docsUploaded = documentRequests.reduce((sum, r) => sum + r.items.filter((i) => i.status !== "pending").length, 0);
  const docsTotal = documentRequests.reduce((sum, r) => sum + r.items.length, 0);
  const activeInfoRequests = infoRequests.filter((r) => r.status === "active" || r.status === "viewed").length;

  async function setAnswerStatus(answerId: string, status: OrganizerReviewStatus) {
    setBusyAnswerId(answerId);
    const { error } = await supabase.rpc("set_organizer_answer_review_status", { p_answer_id: answerId, p_status: status });
    setBusyAnswerId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function setResponseStatus(status: OrganizerReviewStatus) {
    setBusyResponse(true);
    const { error } = await supabase.rpc("set_organizer_response_review_status", { p_response_id: response.id, p_status: status });
    setBusyResponse(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(`Marked ${status}.`, "success");
    router.refresh();
  }

  async function sendInformationRequest(message: string, sendEmail: boolean, sendSms: boolean, showInPortal: boolean) {
    const { data, error } = await supabase.rpc("create_organizer_information_request", {
      p_response_id: response.id,
      p_message: message,
      p_organizer_field_id: needsInfoTarget?.fieldId ?? undefined,
      p_send_email: sendEmail,
      p_send_sms: sendSms,
      p_show_in_portal: showInPortal,
    });
    if (error) return error.message;
    setInfoRequests((prev) => [
      {
        id: data as string,
        organizer_field_id: needsInfoTarget?.fieldId ?? null,
        message,
        status: "active",
        sent_via_email: sendEmail,
        sent_via_sms: sendSms,
        shown_in_portal: showInPortal,
        created_at: new Date().toISOString(),
        viewed_at: null,
        responded_at: null,
        resolved_at: null,
      },
      ...prev,
    ]);
    toast.show("Sent to client.", "success");
    router.refresh();
  }

  async function resolveInfoRequest(id: string) {
    const { error } = await supabase.rpc("resolve_organizer_information_request", { p_request_id: id });
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setInfoRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: "resolved", resolved_at: new Date().toISOString() } : r)));
    router.refresh();
  }

  async function assignReviewer(userId: string) {
    setAssignedReviewerId(userId);
    const { error } = await supabase.from("organizer_responses").update({ assigned_reviewer_id: userId || null }).eq("id", response.id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Assignment saved.", "success");
    router.refresh();
  }

  async function addNote() {
    if (!noteBody.trim()) return;
    setSavingNote(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("notes").insert({
      workspace_id: workspaceId,
      entity_type: "organizer_response",
      entity_id: response.id,
      author_id: user?.id,
      body: noteBody.trim(),
    });
    setSavingNote(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setNoteBody("");
    router.refresh();
  }

  const backHref = response.engagementId ? `/engagements/${response.engagementId}` : `/clients/${response.clientId}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4">
        <Link href={backHref} className="text-xs font-medium text-muted hover:text-ink">
          ← Back
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-ink">
            {clientName} — {response.templateName}
            {taxYear ? ` (${taxYear})` : ""}
          </p>
          <p className="text-[11px] text-muted">
            {engagementNumber ? `${engagementNumber} · ` : ""}
            {response.submittedAt ? `Submitted ${new Date(response.submittedAt).toLocaleDateString()}` : "Not yet submitted"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {response.reviewStatus && <Badge tone={RESPONSE_STATUS_TONE[response.reviewStatus]}>{response.reviewStatus}</Badge>}
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-border bg-surfaceMuted px-4 py-2 text-xs text-muted">
        <span>
          {totalVisible - totalAttention}/{totalVisible} reviewed
        </span>
        <span>
          {docsUploaded}/{docsTotal} documents
        </span>
        <span className={activeInfoRequests > 0 ? "font-medium text-warning" : ""}>{activeInfoRequests} active info requests</span>
        <span className={totalAttention > 0 ? "font-medium text-danger" : ""}>{totalAttention} pending review</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: section nav */}
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-border bg-surface py-2">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSectionId(s.id)}
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${
                s.id === activeSectionId ? "bg-accentSoft font-medium text-accent" : "text-slate hover:bg-surfaceMuted"
              }`}
            >
              <Badge tone={sectionTone(s)}>{s.label}</Badge>
            </button>
          ))}
        </aside>

        {/* Center: review cards */}
        <main className="flex-1 overflow-y-auto p-6">
          {!activeSection || activeSection.entries.length === 0 ? (
            <EmptyState message="No questions in this section." />
          ) : (
            <div className="space-y-3">
              {activeSection.entries.map((entry) =>
                entry.kind === "question" ? (
                  <QuestionCard
                    key={entry.item.fieldId}
                    item={entry.item}
                    busy={busyAnswerId === entry.item.answerId}
                    onApprove={() => entry.item.answerId && setAnswerStatus(entry.item.answerId, "Approved")}
                    onReject={() => entry.item.answerId && setAnswerStatus(entry.item.answerId, "Rejected")}
                    onNeedsInfo={() => setNeedsInfoTarget({ fieldId: entry.item.fieldId, label: entry.item.label })}
                    collapsedHidden={collapsedHidden}
                  />
                ) : (
                  <div key={entry.group.fieldId} className="rounded-2xl border border-border bg-surface shadow-soft p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{entry.group.label}</p>
                    {entry.group.instances.length === 0 ? (
                      <p className="mt-1 text-xs text-muted">None provided.</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {entry.group.instances.map((instance) => (
                          <div key={instance.index} className="rounded-lg bg-surfaceMuted p-3">
                            <p className="mb-2 text-xs font-medium text-ink">
                              {entry.group.label} {instance.index + 1}
                            </p>
                            <div className="space-y-2">
                              {instance.items.map((item) => (
                                <QuestionCard
                                  key={item.fieldId}
                                  item={item}
                                  compact
                                  busy={busyAnswerId === item.answerId}
                                  onApprove={() => item.answerId && setAnswerStatus(item.answerId, "Approved")}
                                  onReject={() => item.answerId && setAnswerStatus(item.answerId, "Rejected")}
                                  onNeedsInfo={() => setNeedsInfoTarget({ fieldId: item.fieldId, label: item.label })}
                                  collapsedHidden={collapsedHidden}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}
          {sections.some((s) => s.entries.some((e) => e.kind === "question" && e.item.status === "not_applicable")) && (
            <button type="button" onClick={() => setCollapsedHidden((v) => !v)} className="mt-4 text-xs font-medium text-muted hover:text-ink">
              {collapsedHidden ? "Show conditionally hidden questions" : "Hide conditionally hidden questions"}
            </button>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <button
              type="button"
              disabled={sections.findIndex((s) => s.id === activeSectionId) === 0}
              onClick={() => {
                const i = sections.findIndex((s) => s.id === activeSectionId);
                if (i > 0) setActiveSectionId(sections[i - 1].id);
              }}
              className="text-sm font-medium text-muted hover:text-ink disabled:opacity-40"
            >
              ← Previous section
            </button>
            <button
              type="button"
              disabled={sections.findIndex((s) => s.id === activeSectionId) === sections.length - 1}
              onClick={() => {
                const i = sections.findIndex((s) => s.id === activeSectionId);
                if (i < sections.length - 1) setActiveSectionId(sections[i + 1].id);
              }}
              className="text-sm font-medium text-muted hover:text-ink disabled:opacity-40"
            >
              Next section →
            </button>
          </div>
        </main>

        {/* Right: actions, requests, activity */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-surface p-4 space-y-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Review decision</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setResponseStatus("Approved")}
                disabled={busyResponse}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald px-2.5 py-1.5 text-xs font-medium text-emerald hover:bg-emeraldSoft disabled:opacity-60"
              >
                <Check size={12} /> Approve
              </button>
              <button
                type="button"
                onClick={() => setNeedsInfoTarget({ fieldId: null, label: null })}
                disabled={busyResponse}
                className="inline-flex items-center gap-1 rounded-lg border border-amber px-2.5 py-1.5 text-xs font-medium text-amber hover:bg-amberSoft disabled:opacity-60"
              >
                <HelpCircle size={12} /> Needs Info
              </button>
              <button
                type="button"
                onClick={() => setResponseStatus("Rejected")}
                disabled={busyResponse}
                className="inline-flex items-center gap-1 rounded-lg border border-rose px-2.5 py-1.5 text-xs font-medium text-rose hover:bg-roseSoft disabled:opacity-60"
              >
                <X size={12} /> Deny
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Assign reviewer</p>
            <select
              value={assignedReviewerId}
              onChange={(e) => assignReviewer(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">Unassigned</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name ?? "Staff"}
                </option>
              ))}
            </select>
          </div>

          {infoRequests.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Information requests</p>
              <ul className="space-y-2">
                {infoRequests.map((r) => (
                  <li key={r.id} className="rounded-lg border border-border p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={r.status === "resolved" ? "success" : r.status === "responded" ? "accent" : "warning"}>
                        {r.status === "active" ? "Active" : r.status === "viewed" ? "Client viewed" : r.status === "responded" ? "Client responded" : "Resolved"}
                      </Badge>
                      <span className="text-muted">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="mt-1 text-slate">{r.message}</p>
                    {r.status !== "resolved" && (
                      <button type="button" onClick={() => resolveInfoRequest(r.id)} className="mt-1 font-medium text-accent hover:underline">
                        Mark resolved
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Internal notes</p>
            <div className="space-y-2">
              <textarea
                rows={2}
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Note staff only can see..."
                className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={addNote}
                disabled={savingNote || !noteBody.trim()}
                className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {savingNote ? "Saving..." : "Add note"}
              </button>
            </div>
            {notes.length > 0 && (
              <ul className="mt-2 space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-surfaceMuted p-2 text-xs">
                    <p className="text-slate">{n.body}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      {n.authorName} · {new Date(n.created_at).toLocaleDateString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Documents</p>
            <RequestsPanel
              requests={documentRequests}
              templates={documentRequestTemplates}
              workspaceId={workspaceId}
              entityType={entityType}
              entityId={entityId}
              clientEmail={clientEmail}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Activity</p>
            {activity.length === 0 ? (
              <p className="text-xs text-muted">No activity recorded yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {activity.slice(0, 20).map((a) => (
                  <li key={a.id} className="text-xs">
                    <p className="text-slate">{a.description}</p>
                    <p className="text-[11px] text-muted">{new Date(a.created_at).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {needsInfoTarget !== null && (
        <NeedsInfoModal fieldLabel={needsInfoTarget.label} clientEmail={clientEmail} onClose={() => setNeedsInfoTarget(null)} onSend={sendInformationRequest} />
      )}
    </div>
  );
}

function QuestionCard({
  item,
  busy,
  compact = false,
  collapsedHidden,
  onApprove,
  onReject,
  onNeedsInfo,
}: {
  item: ReviewQuestionItem;
  busy: boolean;
  compact?: boolean;
  collapsedHidden: boolean;
  onApprove: () => void;
  onReject: () => void;
  onNeedsInfo: () => void;
}) {
  if (item.status === "not_applicable" && collapsedHidden) {
    return null;
  }

  const isHidden = item.status === "not_applicable";
  const canDecide = Boolean(item.answerId) && !isHidden;

  return (
    <div className={`rounded-2xl border border-border bg-surface shadow-soft ${compact ? "p-3" : "p-4"} ${isHidden ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{item.label}</p>
          {item.helpText && <p className="mt-0.5 text-xs text-muted">{item.helpText}</p>}
        </div>
        <Badge tone={QUESTION_STATUS_TONE[item.status]}>{QUESTION_STATUS_LABEL[item.status]}</Badge>
      </div>

      {!isHidden && (
        <div className="mt-2 text-sm text-slate">
          {item.maskable && item.answerId ? <OrganizerAnswerReveal answerId={item.answerId} masked={item.display} /> : item.display || <span className="text-muted">No answer</span>}
        </div>
      )}

      {item.pendingChange && (
        <div className="mt-2 rounded-lg bg-amberSoft px-2.5 py-1.5 text-xs text-amber">
          Client proposed a change to {item.pendingChange.target_column}: {item.pendingChange.old_value || "(blank)"} → {item.pendingChange.new_value_last4 ?? item.pendingChange.new_value}
          {" — review from the "}
          <Link href="/review-queue" className="underline">
            Review Queue
          </Link>
          .
        </div>
      )}

      {item.reviewNote && <p className="mt-2 text-xs italic text-muted">&quot;{item.reviewNote}&quot;</p>}

      {!isHidden && (
        <div className="mt-2 flex items-center gap-3 text-xs">
          <button type="button" onClick={onApprove} disabled={!canDecide || busy} className="font-medium text-emerald hover:underline disabled:opacity-40">
            Approve
          </button>
          <button type="button" onClick={onNeedsInfo} disabled={busy} className="font-medium text-amber hover:underline disabled:opacity-40">
            Needs Info
          </button>
          <button type="button" onClick={onReject} disabled={!canDecide || busy} className="font-medium text-rose hover:underline disabled:opacity-40">
            Deny
          </button>
        </div>
      )}
    </div>
  );
}
