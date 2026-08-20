"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type ActionRow = { id: string; action: string; comment: string | null; created_at: string };

export function ReviewQueueItem({
  shareId,
  status,
  clientName,
  engagementNumber,
  engagementId,
  fromWorkspaceName,
  actions,
}: {
  shareId: string;
  status: string;
  clientName: string;
  engagementNumber: string | null;
  engagementId: string | null;
  fromWorkspaceName: string;
  actions: ActionRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [showCorrections, setShowCorrections] = useState(false);

  async function approve() {
    setBusy("approve");
    const res = await fetch(`/api/engagement-shares/${shareId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      toast.show(data.error ?? "Could not approve this filing.", "error");
      return;
    }
    if (data.failedFiles?.length > 0) {
      toast.show(`Approved, but ${data.failedFiles.length} document(s) failed to copy.`, "error");
    } else {
      toast.show("Approved -- a copy now lives in your workspace.", "success");
    }
    router.refresh();
  }

  async function reject() {
    if (!confirm("Reject this filing? The PTIN will be notified.")) return;
    setBusy("reject");
    const { error } = await supabase.rpc("respond_to_engagement_share", { p_engagement_share_id: shareId, p_approve: false });
    setBusy(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function requestCorrections() {
    if (!comment.trim()) return;
    setBusy("corrections");
    const { error } = await supabase.rpc("review_request_corrections", { p_engagement_share_id: shareId, p_comment: comment.trim() });
    setBusy(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setComment("");
    setShowCorrections(false);
    router.refresh();
  }

  return (
    <li className="rounded-2xl border border-border bg-surface shadow-soft p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">
            {clientName} {engagementNumber ? `-- ${engagementNumber}` : ""}
          </p>
          <p className="text-xs text-muted">
            From {fromWorkspaceName} {status === "corrections_requested" && <span className="text-warning">-- corrections requested</span>}
          </p>
          {engagementId && (
            <Link href={`/engagements/${engagementId}`} className="mt-1 inline-block text-xs text-accent hover:underline">
              View the full engagement
            </Link>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={approve}
            disabled={busy !== null}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
          >
            {busy === "approve" ? "Approving..." : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => setShowCorrections((v) => !v)}
            disabled={busy !== null}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent disabled:opacity-60"
          >
            Request corrections
          </button>
          <button
            type="button"
            onClick={reject}
            disabled={busy !== null}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-danger transition hover:border-danger disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      </div>

      {showCorrections && (
        <div className="mt-3 flex gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What needs to be fixed?"
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={requestCorrections}
            disabled={busy !== null || !comment.trim()}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
          >
            Send
          </button>
        </div>
      )}

      {actions.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-2">
          {actions.map((a) => (
            <li key={a.id} className="text-xs text-muted">
              {a.action.replace(/_/g, " ")} -- {new Date(a.created_at).toLocaleString()}
              {a.comment ? `: ${a.comment}` : ""}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
