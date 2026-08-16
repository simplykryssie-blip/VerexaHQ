"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { renderEmail } from "@/lib/email/template";
import type { Audience, EntityType } from "./types";

const CATEGORIES = [
  "Tax Return",
  "W-2",
  "1099",
  "Identification",
  "Engagement Letter",
  "Financial Statement",
  "Correspondence",
  "Other",
];

export function UploadZone({
  workspaceId,
  entityType,
  entityId,
  folderId,
  audience = "staff",
  clientEmail,
}: {
  workspaceId: string;
  entityType: EntityType;
  entityId: string;
  folderId: string | null;
  audience?: Audience;
  clientEmail?: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState("");
  // Staff choose per-upload whether the client can see it; a client uploading
  // their own file from the portal always shares it with themselves.
  const [shareWithClient, setShareWithClient] = useState(false);

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const visibility = audience === "portal" || shareWithClient ? "client_visible" : "internal";

    let succeeded = 0;
    let failed = 0;

    for (const file of Array.from(files)) {
      const path = `${workspaceId}/${entityId}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("client-documents").upload(path, file);
      if (uploadErr) {
        failed += 1;
        continue;
      }
      const { error: insertErr } = await supabase.from("attachments").insert({
        workspace_id: workspaceId,
        entity_type: entityType,
        entity_id: entityId,
        folder_id: folderId,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type || null,
        file_size_bytes: file.size,
        uploaded_by: user?.id,
        visibility,
        category: category || null,
      });
      if (insertErr) failed += 1;
      else succeeded += 1;
    }

    setUploading(false);
    if (succeeded > 0) toast.show(`Uploaded ${succeeded} document${succeeded === 1 ? "" : "s"}`, "success");
    if (failed > 0) toast.show(`${failed} upload${failed === 1 ? "" : "s"} failed`, "error");

    if (succeeded > 0 && audience === "staff" && shareWithClient && clientEmail) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: clientEmail,
          sender: "notifications",
          subject: "A new document is available in your portal",
          html: renderEmail({
            heading: "A new document is ready for you",
            bodyHtml: `<p>Your tax office has added ${succeeded === 1 ? "a document" : `${succeeded} documents`} to your client portal. Log in to view ${succeeded === 1 ? "it" : "them"}.</p>`,
            ctaLabel: "Go to portal",
            ctaUrl: `${appUrl}/portal/login`,
          }),
        }),
      }).catch(() => {
        // Best-effort -- the upload itself already succeeded.
      });
    }

    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-border px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Uncategorized</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {audience === "staff" && (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={shareWithClient}
              onChange={(e) => setShareWithClient(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
            />
            Visible to client{shareWithClient && !clientEmail ? " (no email on file -- won't be notified)" : ""}
          </label>
        )}
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition ${
          dragging ? "border-accent bg-accentSoft" : "border-border"
        }`}
      >
        <UploadCloud size={22} className={dragging ? "text-accent" : "text-muted"} aria-hidden="true" />
        <p className="text-sm text-muted">
          {uploading ? "Uploading..." : dragging ? "Drop files to upload" : "Drag and drop files here, or"}
        </p>
        <label className="cursor-pointer text-sm font-medium text-accent hover:underline">
          browse to upload
          <input
            type="file"
            multiple
            disabled={uploading}
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
            className="sr-only"
          />
        </label>
      </div>
    </div>
  );
}
