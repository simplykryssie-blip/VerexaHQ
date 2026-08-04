"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import type { EntityType } from "./types";

export function UploadZone({
  workspaceId,
  entityType,
  entityId,
  folderId,
}: {
  workspaceId: string;
  entityType: EntityType;
  entityId: string;
  folderId: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
      });
      if (insertErr) failed += 1;
      else succeeded += 1;
    }

    setUploading(false);
    if (succeeded > 0) toast.show(`Uploaded ${succeeded} document${succeeded === 1 ? "" : "s"}`, "success");
    if (failed > 0) toast.show(`${failed} upload${failed === 1 ? "" : "s"} failed`, "error");
    router.refresh();
  }

  return (
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
  );
}
