"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function ClientReviewActions({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();
  const [loading, setLoading] = useState<"approve" | "changes" | "decline" | null>(null);
  const [mode, setMode] = useState<"idle" | "changes" | "decline">("idle");
  const [comment, setComment] = useState("");

  async function approve() {
    if (!window.confirm("Approve this return? This will mark it Filed/Completed.")) return;
    setLoading("approve");
    const { error } = await supabase.rpc("approve_client_review", { p_engagement_id: engagementId });
    setLoading(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Return approved.", "success");
    router.refresh();
  }

  async function submitChanges() {
    setLoading("changes");
    const { error } = await supabase.rpc("request_client_review_changes", { p_engagement_id: engagementId, p_comment: comment.trim() || undefined });
    setLoading(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Change request sent.", "success");
    setMode("idle");
    setComment("");
    router.refresh();
  }

  async function submitDecline() {
    if (!comment.trim()) {
      toast.show("Please provide a reason.", "error");
      return;
    }
    if (!window.confirm("Decline filing? This will end this engagement's normal review cycle.")) return;
    setLoading("decline");
    const { error } = await supabase.rpc("decline_client_review_filing", { p_engagement_id: engagementId, p_reason: comment.trim() });
    setLoading(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Filing declined.", "success");
    setMode("idle");
    setComment("");
    router.refresh();
  }

  const disabled = loading !== null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <p className="text-sm font-semibold text-ink">Your prepared return is ready for review</p>
      <p className="mt-1 text-xs text-muted">Review the documents below, then approve, request changes, or decline filing.</p>

      {mode === "idle" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={disabled}
            onClick={approve}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {loading === "approve" ? "Approving..." : "Approve"}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode("changes")}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-surfaceMuted disabled:opacity-60"
          >
            Request Changes
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode("decline")}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-danger disabled:opacity-60"
          >
            Decline Filing
          </button>
        </div>
      )}

      {mode === "changes" && (
        <div className="mt-3 space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What would you like changed? (optional)"
            className="w-full rounded-lg border border-border bg-surface p-2 text-sm text-ink"
            rows={3}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={submitChanges}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {loading === "changes" ? "Sending..." : "Send Request"}
            </button>
            <button type="button" disabled={disabled} onClick={() => setMode("idle")} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "decline" && (
        <div className="mt-3 space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Please tell us why you're declining to file (required)"
            className="w-full rounded-lg border border-border bg-surface p-2 text-sm text-ink"
            rows={3}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={submitDecline}
              className="rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white hover:bg-danger/90 disabled:opacity-60"
            >
              {loading === "decline" ? "Submitting..." : "Decline Filing"}
            </button>
            <button type="button" disabled={disabled} onClick={() => setMode("idle")} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
