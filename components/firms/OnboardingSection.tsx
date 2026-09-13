"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, MinusCircle, MessageSquare, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/Badge";
import { createSignatureRequestFromTemplate } from "@/lib/documents/createSignatureRequestFromTemplate";
import type { DocumentRequestTemplateOption, EngagementLetterTemplateOption } from "@/components/documents/types";
import {
  deriveChecklist,
  deriveWaitingOn,
  daysSince,
  maskApplicationData,
  ONBOARDING_STATUS_TONE,
  ONBOARDING_STATUS_LABEL,
  type PartnerOnboardingRow,
} from "@/lib/partnerOnboarding";

const cardClass = "rounded-2xl border border-border bg-surface p-4 shadow-soft";
const selectClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export type OnboardingWorkflowInfo = { id: string; name: string; is_enabled: boolean; status: string; trigger_type: string; update_available: boolean };

export type OnboardingRecord = PartnerOnboardingRow & {
  id: string;
  package_name: string | null;
  application_data: Record<string, unknown> | null;
  review_note: string | null;
  rejected_reason: string | null;
  // Phase 6G: whether an agreement/document request has actually been
  // created and linked yet -- distinct from agreement_signed/
  // documents_completed, which stay false both before configuration and
  // while a real, linked request is still awaiting the partner.
  agreement_signature_request_id: string | null;
  document_request_id: string | null;
};

function ChecklistIcon({ state }: { state: "complete" | "active" | "pending" | "not_required" }) {
  if (state === "complete") return <CheckCircle2 size={15} className="text-success" aria-hidden="true" />;
  if (state === "not_required") return <MinusCircle size={15} className="text-muted" aria-hidden="true" />;
  if (state === "active") return <Circle size={15} className="text-accent" fill="currentColor" fillOpacity={0.15} aria-hidden="true" />;
  return <Circle size={15} className="text-muted" aria-hidden="true" />;
}

export function OnboardingSection({
  workspaceId,
  connectionId,
  onboarding,
  canManage,
  defaultReviewerName,
  packageId,
  workflows,
  isConnectionActive,
  documentRequestTemplates,
  engagementLetterTemplates,
  partnerOwnerName,
  partnerContactEmail,
  parentFirmName,
}: {
  workspaceId: string;
  connectionId: string;
  onboarding: OnboardingRecord | null;
  /** is_workspace_admin(workspaceId) -- record_partner_onboarding_review and the
   *  setup-completion RPCs require it; a staff member with only
   *  firm_connections.manage (enough to see this page) may not qualify. */
  canManage: boolean;
  defaultReviewerName: string | null;
  packageId: string | null;
  workflows: OnboardingWorkflowInfo[];
  /** firm_connections.status === 'active' -- Start Onboarding only makes
   *  sense for a real, connected partner (Phase 6G). */
  isConnectionActive: boolean;
  documentRequestTemplates: DocumentRequestTemplateOption[];
  engagementLetterTemplates: EngagementLetterTemplateOption[];
  partnerOwnerName: string | null;
  partnerContactEmail: string | null;
  parentFirmName: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showNoteFor, setShowNoteFor] = useState<"rejected" | "info_requested" | null>(null);
  const [documentTemplateId, setDocumentTemplateId] = useState(documentRequestTemplates.length === 1 ? documentRequestTemplates[0].id : "");
  const [agreementTemplateId, setAgreementTemplateId] = useState(engagementLetterTemplates.length === 1 ? engagementLetterTemplates[0].id : "");
  const [signerName, setSignerName] = useState(partnerOwnerName ?? "");
  const [signerEmail, setSignerEmail] = useState(partnerContactEmail ?? "");

  // Phase 6G: the parent-side path to begin onboarding for a connected
  // partner who never purchased a package -- the same create_partner_onboarding
  // RPC the purchase automation already calls, just given a UI caller.
  async function startOnboarding() {
    setBusy("start");
    const { error } = await supabase.rpc("create_partner_onboarding", {
      p_workspace_id: workspaceId,
      p_firm_connection_id: connectionId,
      p_package_id: packageId ?? undefined,
    });
    setBusy(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Onboarding started", "success");
    router.refresh();
  }

  if (!onboarding) {
    return (
      <div className={cardClass}>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink">Partner Onboarding</p>
        <p className="mt-2 text-sm text-muted">No onboarding record yet -- one is created automatically when this firm purchases a package.</p>
        {canManage && isConnectionActive && (
          <div className="mt-3">
            <button
              type="button"
              onClick={startOnboarding}
              disabled={busy !== null}
              className="rounded-lg border border-accent bg-accentSoft px-3 py-1.5 text-xs font-medium text-accent disabled:opacity-60"
            >
              {busy === "start" ? "Starting..." : "Start Onboarding"}
            </button>
          </div>
        )}
        {workflows.length > 0 && <WorkflowStrip workflows={workflows} />}
      </div>
    );
  }

  const waiting = deriveWaitingOn(onboarding);
  const checklist = deriveChecklist(onboarding);
  const masked = maskApplicationData(onboarding.application_data);
  const isTerminal = onboarding.status === "rejected" || onboarding.status === "withdrawn";
  // Function declarations below don't inherit the `if (!onboarding) return`
  // narrowing above (TS treats them as independently hoisted) -- capture the
  // id once here instead of re-narrowing `onboarding` in each one.
  const onboardingId = onboarding.id;
  // Phase 6G: distinguishes "nothing has ever been linked" (the completion
  // engine has work to do) from "linked, just not yet completed by the
  // partner" (the checklist above already shows that correctly).
  const needsAgreementConfig = onboarding.agreement_required && !onboarding.agreement_signature_request_id;
  const needsDocumentConfig = onboarding.documents_required && !onboarding.document_request_id;

  async function review(decision: "approved" | "rejected" | "info_requested") {
    if ((decision === "rejected" || decision === "info_requested") && showNoteFor !== decision) {
      setShowNoteFor(decision);
      return;
    }
    setBusy(decision);
    const { error } = await supabase.rpc("record_partner_onboarding_review", {
      p_workspace_id: workspaceId,
      p_onboarding_id: onboardingId,
      p_decision: decision,
      p_note: note.trim() || undefined,
    });
    setBusy(null);
    setShowNoteFor(null);
    setNote("");
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(decision === "approved" ? "Onboarding approved" : decision === "rejected" ? "Onboarding rejected" : "Information requested", "success");
    router.refresh();
  }

  async function setTraining(completed: boolean) {
    setBusy("training");
    const { error } = await supabase.rpc("set_partner_onboarding_training", {
      p_workspace_id: workspaceId,
      p_onboarding_id: onboardingId,
      p_completed: completed,
    });
    setBusy(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function setBankSoftware(completed: boolean) {
    setBusy("bank_software");
    const { error } = await supabase.rpc("set_partner_onboarding_bank_software_setup", {
      p_workspace_id: workspaceId,
      p_onboarding_id: onboardingId,
      p_completed: completed,
    });
    setBusy(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  // Phase 6G: the completion engine. Staff picks a template -- never a raw
  // request ID -- and the system creates/links the real request through the
  // existing document/signature infrastructure.
  async function configureDocuments() {
    if (!documentTemplateId) {
      toast.show("Choose a document template.", "error");
      return;
    }
    setBusy("configure_documents");
    const { error } = await supabase.rpc("configure_partner_onboarding_document_request", {
      p_workspace_id: workspaceId,
      p_onboarding_id: onboardingId,
      p_document_request_template_id: documentTemplateId,
    });
    setBusy(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Document request configured", "success");
    router.refresh();
  }

  async function configureAgreement() {
    const template = engagementLetterTemplates.find((t) => t.id === agreementTemplateId);
    if (!template) {
      toast.show("Choose an agreement template.", "error");
      return;
    }
    const name = signerName.trim();
    if (!name) {
      toast.show("Enter who will sign the agreement.", "error");
      return;
    }
    setBusy("configure_agreement");
    const result = await createSignatureRequestFromTemplate({
      supabase,
      workspaceId,
      entityType: "firm_connection",
      entityId: connectionId,
      template,
      clientName: name,
      clientEmail: signerEmail.trim() || null,
      firmName: parentFirmName,
      signers: [{ signer_name: name, signer_email: signerEmail.trim() || null }],
      title: template.name,
    });
    if ("error" in result) {
      setBusy(null);
      toast.show(result.error, "error");
      return;
    }
    const { error } = await supabase.rpc("set_partner_onboarding_agreement_request", {
      p_workspace_id: workspaceId,
      p_onboarding_id: onboardingId,
      p_signature_request_id: result.requestId,
    });
    setBusy(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Agreement configured", "success");
    router.refresh();
  }

  async function startNewOnboarding() {
    if (!window.confirm("Start a fresh onboarding for this firm? This creates a brand-new record -- it does not reopen the old one.")) return;
    setBusy("restart");
    const { error } = await supabase.rpc("create_partner_onboarding", {
      p_workspace_id: workspaceId,
      p_firm_connection_id: connectionId,
      p_package_id: packageId ?? undefined,
    });
    setBusy(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("New onboarding started", "success");
    router.refresh();
  }

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink">Partner Onboarding</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={ONBOARDING_STATUS_TONE[onboarding.status] ?? "neutral"}>{ONBOARDING_STATUS_LABEL[onboarding.status] ?? onboarding.status}</Badge>
            <span className="text-xs text-muted">
              {waiting.label}
              {waiting.moreCount > 0 && ` (+${waiting.moreCount} more)`}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">{waiting.detail}</p>
        </div>
        <dl className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted">
          <div>
            Assigned: <span className="font-medium text-slate">{defaultReviewerName ?? "Unassigned"}</span>
          </div>
          <div>Started {daysSince(onboarding.created_at)} day{daysSince(onboarding.created_at) === 1 ? "" : "s"} ago</div>
        </dl>
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4">
        {checklist.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5 text-xs">
            <ChecklistIcon state={item.state} />
            <span className={item.state === "not_required" ? "text-muted line-through" : item.state === "active" ? "font-medium text-ink" : "text-slate"}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>

      {canManage && !isTerminal && needsAgreementConfig && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Configure agreement</p>
          <p className="mt-1 text-xs text-muted">Required before this onboarding can move to review. Choose a template -- the system creates and sends the request.</p>
          {engagementLetterTemplates.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              No agreement templates are set up yet. Add one under Settings, or turn off the agreement requirement if this partner doesn&apos;t need one.
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-muted">
                Template
                <select value={agreementTemplateId} onChange={(e) => setAgreementTemplateId(e.target.value)} className={selectClass}>
                  <option value="">Choose a template...</option>
                  {engagementLetterTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-muted">
                Signer name
                <input value={signerName} onChange={(e) => setSignerName(e.target.value)} className={selectClass} />
              </label>
              <label className="text-xs font-medium text-muted sm:col-span-2">
                Signer email
                <input value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} className={selectClass} />
              </label>
            </div>
          )}
          {engagementLetterTemplates.length > 0 && (
            <button
              type="button"
              onClick={configureAgreement}
              disabled={busy !== null || !agreementTemplateId}
              className="mt-3 rounded-lg border border-accent bg-accentSoft px-3 py-1.5 text-xs font-medium text-accent disabled:opacity-60"
            >
              {busy === "configure_agreement" ? "Sending..." : "Send agreement for signature"}
            </button>
          )}
        </div>
      )}

      {canManage && !isTerminal && needsDocumentConfig && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Configure required documents</p>
          <p className="mt-1 text-xs text-muted">Required before this onboarding can move to review. Choose a checklist template -- the system creates the request.</p>
          {documentRequestTemplates.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              No document request templates are set up yet. Add one under Settings, or turn off the documents requirement if this partner doesn&apos;t need any.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <label className="text-xs font-medium text-muted">
                Template
                <select value={documentTemplateId} onChange={(e) => setDocumentTemplateId(e.target.value)} className={selectClass}>
                  <option value="">Choose a template...</option>
                  {documentRequestTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={configureDocuments}
                disabled={busy !== null || !documentTemplateId}
                className="rounded-lg border border-accent bg-accentSoft px-3 py-1.5 text-xs font-medium text-accent disabled:opacity-60"
              >
                {busy === "configure_documents" ? "Requesting..." : "Request documents"}
              </button>
            </div>
          )}
        </div>
      )}

      {masked.visible.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Application</p>
          <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {masked.visible.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs uppercase tracking-wide text-muted">{key}</dt>
                <dd className="text-slate">{value}</dd>
              </div>
            ))}
          </dl>
          {masked.hiddenCount > 0 && (
            <p className="mt-2 text-[11px] text-muted">
              {masked.hiddenCount} field{masked.hiddenCount === 1 ? "" : "s"} hidden -- looked like a tax ID or credential, which belongs in this firm&apos;s
              tax profile, not the application record.
            </p>
          )}
        </div>
      )}

      {canManage && onboarding.status === "under_review" && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Review decision</p>
          {showNoteFor && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={showNoteFor === "rejected" ? "Reason for rejection (shown to the partner)" : "What's missing? (shown to the partner)"}
              rows={2}
              className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => review("approved")}
              disabled={busy !== null}
              className="rounded-lg border border-accent bg-accentSoft px-3 py-1.5 text-xs font-medium text-accent disabled:opacity-60"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => review("info_requested")}
              disabled={busy !== null}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-60"
            >
              {showNoteFor === "info_requested" ? "Send request" : "Request Information"}
            </button>
            <button
              type="button"
              onClick={() => review("rejected")}
              disabled={busy !== null}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-danger hover:border-danger disabled:opacity-60"
            >
              {showNoteFor === "rejected" ? "Confirm reject" : "Reject"}
            </button>
          </div>
        </div>
      )}

      {canManage && ["approved", "setup"].includes(onboarding.status) && (onboarding.training_required || onboarding.bank_software_setup_required) && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Setup</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {onboarding.training_required && (
              <button
                type="button"
                onClick={() => setTraining(!onboarding.training_completed_at)}
                disabled={busy !== null}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-60"
              >
                {onboarding.training_completed_at ? "Mark training incomplete" : "Mark training complete"}
              </button>
            )}
            {onboarding.bank_software_setup_required && (
              <button
                type="button"
                onClick={() => setBankSoftware(!onboarding.bank_software_setup_completed_at)}
                disabled={busy !== null}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-60"
              >
                {onboarding.bank_software_setup_completed_at ? "Mark bank/software incomplete" : "Mark bank/software complete"}
              </button>
            )}
            <Link href="/learning" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent">
              View Learning Hub <ExternalLink size={11} aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}

      {canManage && isTerminal && (
        <div className="mt-4 border-t border-border pt-4">
          <button
            type="button"
            onClick={startNewOnboarding}
            disabled={busy !== null}
            className="rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accentSoft disabled:opacity-60"
          >
            Start new onboarding
          </button>
        </div>
      )}

      {onboarding.status !== "ready" && (
        <div className="mt-4 border-t border-border pt-4">
          <Link href="/messages" className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
            <MessageSquare size={13} aria-hidden="true" /> Message partner
          </Link>
        </div>
      )}

      {workflows.length > 0 && <WorkflowStrip workflows={workflows} />}
    </div>
  );
}

// Informational only -- the master vs. workspace-copy distinction (Phase 6A)
// is never editable from here, and nothing on this page ever writes to
// marketplace_templates or a master automation.
function WorkflowStrip({ workflows }: { workflows: OnboardingWorkflowInfo[] }) {
  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Onboarding workflow</p>
      <ul className="mt-2 space-y-1.5">
        {workflows.map((w) => (
          <li key={w.id} className="flex items-center justify-between text-xs">
            <Link href={`/workflows/${w.id}`} className="font-medium text-accent hover:underline">
              {w.name}
            </Link>
            <span className="flex items-center gap-1.5 text-muted">
              <Badge tone={w.is_enabled && w.status === "published" ? "success" : "neutral"}>{w.is_enabled && w.status === "published" ? "Enabled" : "Disabled"}</Badge>
              {w.update_available && <Badge tone="warning">Update available</Badge>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
