"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

// Renders in place of the generic StageReviewActions "Approve" button on
// the "Filed / Awaiting Acceptance" stage only. Recording accepted/rejected
// here (rather than a plain approve) is what lets
// advance_workflow_on_stage_completed() skip the "Rejected / Correction
// Needed" stage for returns that were actually accepted -- without this,
// every filed return silently passes through a stage labeled "Rejected."
export function EfileDecisionActions({
  stageId,
  engagementId,
  workspaceId,
}: {
  stageId: string;
  engagementId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function completeStage(efileStatus: "accepted" | "rejected", rejectedReason?: string) {
    setPending(true);
    setError(null);

    const { error: taxDetailsError } = await supabase.from("engagement_tax_details").upsert(
      {
        engagement_id: engagementId,
        workspace_id: workspaceId,
        efile_status: efileStatus,
        ...(efileStatus === "accepted" ? { efile_accepted_at: new Date().toISOString() } : { efile_rejected_reason: rejectedReason }),
      },
      { onConflict: "engagement_id" }
    );
    if (taxDetailsError) {
      setPending(false);
      setError(taxDetailsError.message);
      return;
    }

    const { error: stageError } = await supabase
      .from("workflow_stages")
      .update({ status: "Completed", completed_at: new Date().toISOString() })
      .eq("id", stageId);
    setPending(false);
    if (stageError) {
      setError(stageError.message);
      return;
    }
    toast.show(efileStatus === "accepted" ? "Marked accepted" : "Marked rejected", "success");
    router.refresh();
  }

  if (rejecting) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for rejection"
          className="w-56 rounded-lg border border-border px-2 py-1 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              setRejecting(false);
              setReason("");
              setError(null);
            }}
            className="rounded-lg px-2 py-1 text-xs font-medium text-slate hover:bg-surfaceMuted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !reason.trim()}
            onClick={() => completeStage("rejected", reason.trim())}
            className="rounded-lg bg-danger px-2 py-1 text-xs font-medium text-white hover:bg-danger/90 disabled:opacity-60"
          >
            {pending ? "Saving..." : "Confirm rejection"}
          </button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="text-right">
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => completeStage("accepted")}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Accepted"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setRejecting(true)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-danger hover:text-danger disabled:opacity-60"
        >
          Rejected
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
