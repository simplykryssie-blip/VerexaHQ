"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileCheck, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

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

// Full per-question review (approve/deny/needs-info, information-request
// lifecycle, activity, assignment) now lives on its own page --
// /organizers/[responseId]/review -- so this card is just a compact
// summary + entry point into it, rather than an inline expand/collapse
// with its own review actions duplicating that page's.
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
  const [filing, setFiling] = useState(false);
  const [pickingService, setPickingService] = useState(false);

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
      <div className="flex w-full items-center justify-between gap-3 p-3 text-sm">
        <span className="text-slate">{response.template_name}</span>
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
      </div>

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
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
          {response.review_status && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${REVIEW_BADGE_TONE[response.review_status]}`}>
              {response.review_status}
            </span>
          )}
          {response.review_status && response.review_note && <span className="text-xs text-muted">&quot;{response.review_note}&quot;</span>}
          <Link
            href={`/organizers/${response.id}/review`}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            Review <ArrowRight size={12} />
          </Link>
        </div>
      )}
    </div>
  );
}
