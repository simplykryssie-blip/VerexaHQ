"use client";

import { useState } from "react";
import { Download, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { documentStatusLabel } from "@/lib/validation/documents";
import { formatDate } from "@/lib/formatters";

// Narrow, client-safe shape — documents.notes/metadata can carry
// staff-only review remarks and must never be passed into this "use
// client" component (every field on a prop serializes into the page's
// RSC payload whether or not it's rendered).
type DocumentRow = {
  id: string;
  workspace_id: string;
  bucket_id: string;
  storage_path: string;
  display_name: string;
  status: string;
  uploaded_at: string | null;
  tax_year: number | null;
  category?: { name?: string | null } | null;
};

// Shared mapper so every call site strips staff-only columns the same way
// instead of re-deriving the safe shape ad hoc.
export function toPortalDocumentRow(d: {
  id: string;
  workspace_id: string;
  bucket_id: string;
  storage_path: string;
  display_name: string;
  status: string;
  uploaded_at: string | null;
  tax_year: number | null;
  category?: { name?: string | null } | null;
}): DocumentRow {
  return {
    id: d.id,
    workspace_id: d.workspace_id,
    bucket_id: d.bucket_id,
    storage_path: d.storage_path,
    display_name: d.display_name,
    status: d.status,
    uploaded_at: d.uploaded_at,
    tax_year: d.tax_year,
    category: d.category,
  };
}

export function PortalDocumentsList({ documents }: { documents: DocumentRow[] }) {
  const supabase = createClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function download(doc: DocumentRow) {
    setBusyId(doc.id);
    // 5-minute signed URL — this app never uses getPublicUrl.
    const { data, error } = await supabase.storage.from(doc.bucket_id).createSignedUrl(doc.storage_path, 300);
    if (error || !data) {
      setBusyId(null);
      toast.error(friendlyDbError(error?.message));
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("document_access_logs").insert({ workspace_id: doc.workspace_id, document_id: doc.id, actor_user_id: user?.id ?? null, action: "download" });
    setBusyId(null);
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No documents shared with you yet.</p>;
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{doc.display_name}</p>
              <p className="text-xs text-muted-foreground">
                {doc.category?.name ?? "Uncategorized"} · {formatDate(doc.uploaded_at)}
                {doc.tax_year ? ` · Tax year ${doc.tax_year}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary">{documentStatusLabel(doc.status)}</Badge>
            <Button size="sm" variant="ghost" disabled={busyId === doc.id} onClick={() => download(doc)} title="Download">
              {busyId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
