"use client";

import { useState } from "react";
import { UploadCloud, X, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

const ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/ogg"];

export function VideoUpload({
  ownerWorkspaceId,
  moduleId,
  value,
  onChange,
}: {
  ownerWorkspaceId: string;
  moduleId: string;
  value: string | null;
  onChange: (path: string | null) => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.show("That file type isn't supported -- upload an MP4, WebM, MOV, AVI, or OGG video.", "error");
      return;
    }
    setUploading(true);
    const path = `${ownerWorkspaceId}/${moduleId}-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("learning-videos").upload(path, file, { upsert: true });
    setUploading(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    if (value) {
      await supabase.storage.from("learning-videos").remove([value]);
    }
    onChange(path);
  }

  async function remove() {
    if (value) await supabase.storage.from("learning-videos").remove([value]);
    onChange(null);
  }

  if (value) {
    const fileName = value.split("/").pop();
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
        <Video size={15} className="text-accent" />
        <span className="flex-1 truncate text-slate">{fileName}</span>
        <button type="button" onClick={remove} className="rounded p-1 text-muted hover:text-danger" aria-label="Remove video">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-slate hover:border-accent hover:text-accent">
      <UploadCloud size={14} />
      {uploading ? "Uploading -- this can take a while for large files..." : "Upload a video file"}
      <input
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/ogg"
        disabled={uploading}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
    </label>
  );
}
