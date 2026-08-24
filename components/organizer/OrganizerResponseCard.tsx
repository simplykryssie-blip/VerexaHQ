"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, FileCheck, Check, X, HelpCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { OrganizerAnswerReveal } from "./OrganizerAnswerReveal";

export type OrganizerFieldAnswer = { fieldId: string; answerId: string | null; label: string; fieldType: string; display: string; maskable: boolean };
export type OrganizerRepeaterGroup = { fieldId: string; label: string; instances: { index: number; fields: OrganizerFieldAnswer[] }[] };
export type OrganizerReviewStatus = "Pending" | "In Review" | "Approved" | "Rejected" | "Corrections Requested";
export type OrganizerResponseDetail = {
  id: string;
  status: string;
  submitted_at: string | null;
  template_name: string;
  filed_as_attachment?: boolean;
  topLevel?: OrganizerFieldAnswer[];
  repeaters?: OrganizerRepeaterGroup[];
  engagement_id?: string | null;
  resolved_service_id?: string | null;
  resolved_service_name?: string | null;
  needs_service_review?: boolean;
  review_status?: OrganizerReviewStatus | null;
  review_note?: string | null;
};

const REVIEW_BADGE_TONE: Record<OrganizerReviewStatus, string> = {
  Pending: "bg-surfaceMuted text-muted",
  "In Review": "bg-accentSoft text-accent",
  Approved: "bg-emeraldSoft text-emerald",
  Rejected: "bg-roseSoft text-rose",
  "Corrections Requested": "bg-amberSoft text-amber",
};

// Clicking anywhere on the row expands/collapses the answers -- the
// content was previously only rendered inline with no way to open/close
// it, which read as "nothing happens when I click this."
export function OrganizerResponseCard({
  response,
  workspaceServices,
}: {
  response: OrganizerResponseDetail;
  workspaceServices?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [filing, setFiling] = useState(false);
  const [pickingService, setPickingService] = useState(false);
  const [reviewing, setReviewing] = useState<OrganizerReviewStatus | null>(null);

  async function setReview(status: OrganizerReviewStatus, notePrompt?: string) {
    let note: string | null = null;
    if (notePrompt) {
      const entered = window.prompt(notePrompt);
      if (entered === null) return; // cancelled -- leave the review status as-is
      note = entered.trim() || null;
    }
    setReviewing(status);
    const { error } = await supabase.rpc("set_organizer_response_review_status", {
      p_response_id: response.id,
      p_status: status,
      p_note: note ?? undefined,
    });
    setReviewing(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(`Marked ${status}.`, "success");
    router.refresh();
  }

  async function pickService(serviceId: string) {
    if (!serviceId) return;
    const { error } = await supabase
      .from("organizer_responses")
      .update({ resolved_service_id: serviceId, needs_service_review: false })
      .eq("id", response.id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  const hasAnswers = response.status === "submitted" || response.status === "reviewed";

  async function fileNow(e: React.MouseEvent) {
    e.stopPropagation();
    setFiling(true);
    try {
      const res = await fetch("/api/documents/file-organizer-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId: response.id }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        toast.show(data.error ?? "Could not file this organizer.", "error");
        return;
      }
      toast.show("Filed to Documents.", "success");
      window.location.reload();
    } catch {
      toast.show("Could not file this organizer.", "error");
    } finally {
      setFiling(false);
    }
  }

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => hasAnswers && setOpen((v) => !v)}
        disabled={!hasAnswers}
        className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm disabled:cursor-default"
      >
        <span className="flex items-center gap-2 text-slate">
          {hasAnswers && (open ? <ChevronDown size={14} className="shrink-0 text-muted" /> : <ChevronRight size={14} className="shrink-0 text-muted" />)}
          {response.template_name}
        </span>
        <span className="flex items-center gap-2">
          {hasAnswers && !response.filed_as_attachment && (
            <button
              type="button"
              onClick={fileNow}
              disabled={filing}
              className="inline-flex items-center gap-1 rounded-full border border-accent px-2 py-0.5 text-[11px] font-medium text-accent hover:bg-accentSoft disabled:opacity-60"
              title="File this organizer's answers into Documents"
            >
              <FileCheck size={11} /> {filing ? "Filing..." : "File to Documents"}
            </button>
          )}
          <span className="capitalize text-muted">
            {response.status.replace("_", " ")}
            {response.submitted_at && ` -- submitted ${new Date(response.submitted_at).toLocaleDateString()}`}
          </span>
        </span>
      </button>

      {!response.engagement_id && response.resolved_service_id && response.resolved_service_name && (
        <div className="border-t border-border px-3 py-2 text-xs text-success">
          Suggested service: <strong>{response.resolved_service_name}</strong> -- it&apos;ll be pre-filled when this engagement is created.
        </div>
      )}

      {!response.engagement_id && response.needs_service_review && (
        <div className="border-t border-border px-3 py-2 text-xs text-warning">
          {pickingService && workspaceServices ? (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <span>Which service is this for?</span>
              <select
                onChange={(e) => pickService(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                defaultValue=""
                className="rounded-lg border border-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="" disabled>
                  Select a service
                </option>
                {workspaceServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPickingService(true);
              }}
              className="font-medium underline"
            >
              This form is used by more than one service -- pick which one this is for
            </button>
          )}
        </div>
      )}

      {hasAnswers && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2" onClick={(e) => e.stopPropagation()}>
          {response.review_status && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${REVIEW_BADGE_TONE[response.review_status]}`}>
              {response.review_status}
            </span>
          )}
          {response.review_status && response.review_note && <span className="text-xs text-muted">&quot;{response.review_note}&quot;</span>}
          <span className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setReview("Approved")}
              disabled={reviewing !== null}
              className="inline-flex items-center gap-1 rounded-full border border-emerald px-2 py-0.5 text-[11px] font-medium text-emerald hover:bg-emeraldSoft disabled:opacity-60"
            >
              <Check size={11} /> {reviewing === "Approved" ? "Saving..." : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => setReview("Corrections Requested", "What's needed from the client?")}
              disabled={reviewing !== null}
              className="inline-flex items-center gap-1 rounded-full border border-amber px-2 py-0.5 text-[11px] font-medium text-amber hover:bg-amberSoft disabled:opacity-60"
            >
              <HelpCircle size={11} /> {reviewing === "Corrections Requested" ? "Saving..." : "Needs Info"}
            </button>
            <button
              type="button"
              onClick={() => setReview("Rejected", "Reason for denying (optional):")}
              disabled={reviewing !== null}
              className="inline-flex items-center gap-1 rounded-full border border-rose px-2 py-0.5 text-[11px] font-medium text-rose hover:bg-roseSoft disabled:opacity-60"
            >
              <X size={11} /> {reviewing === "Rejected" ? "Saving..." : "Deny"}
            </button>
          </span>
        </div>
      )}

      {open && hasAnswers && (
        <div className="space-y-3 border-t border-border p-3">
          {(response.topLevel ?? []).map((f) => (
            <div key={f.fieldId} className="flex items-start justify-between gap-4 text-sm">
              <span className="text-muted">{f.label}</span>
              <span className="text-right text-slate">
                {f.maskable && f.answerId ? <OrganizerAnswerReveal answerId={f.answerId} masked={f.display} /> : f.display}
              </span>
            </div>
          ))}

          {(response.repeaters ?? []).map((r) => (
            <div key={r.fieldId}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{r.label}</p>
              {r.instances.length === 0 ? (
                <p className="mt-1 text-xs text-muted">None provided.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {r.instances.map((instance) => (
                    <div key={instance.index} className="rounded-lg bg-surfaceMuted p-2">
                      <p className="text-xs font-medium text-ink">
                        {r.label} {instance.index + 1}
                      </p>
                      <div className="mt-1 space-y-1">
                        {instance.fields.map((f) => (
                          <div key={f.fieldId} className="flex items-start justify-between gap-4 text-xs">
                            <span className="text-muted">{f.label}</span>
                            <span className="text-right text-slate">
                              {f.maskable && f.answerId ? <OrganizerAnswerReveal answerId={f.answerId} masked={f.display} /> : f.display}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {(response.topLevel ?? []).length === 0 && (response.repeaters ?? []).length === 0 && (
            <p className="text-xs text-muted">No answers were recorded on this organizer.</p>
          )}
        </div>
      )}
    </div>
  );
}
