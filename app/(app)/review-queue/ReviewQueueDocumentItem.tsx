"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileCheck2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Avatar } from "@/components/Avatar";

export function ReviewQueueDocumentItem({
  documentRequestId,
  title,
  entityLabel,
  entityHref,
  completedAt,
}: {
  documentRequestId: string;
  title: string;
  entityLabel: string;
  entityHref: string;
  completedAt: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function markReviewed() {
    setBusy(true);
    const { error } = await supabase.rpc("mark_document_request_reviewed", { p_document_request_id: documentRequestId });
    setBusy(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Marked as reviewed", "success");
    router.refresh();
  }

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-sm shadow-soft">
      <Avatar name={entityLabel} url={null} size="sm" />
      <div className="min-w-0 flex-1">
        <Link href={entityHref} className="font-medium text-ink hover:underline">
          {entityLabel}
        </Link>
        <p className="flex items-center gap-1 text-xs text-muted">
          <FileCheck2 size={12} aria-hidden="true" />
          {title}
          {completedAt ? ` -- completed ${new Date(completedAt).toLocaleDateString()}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={markReviewed}
        disabled={busy}
        className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
      >
        {busy ? "Marking..." : "Mark reviewed"}
      </button>
    </li>
  );
}
