"use client";

import { useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

// Same public "branding" bucket + path convention as BannerImageUpload.tsx,
// just for arbitrary section images rather than a document letterhead.
export function SectionImageUpload({
  workspaceId,
  value,
  onChange,
  label = "Image",
}: {
  workspaceId: string;
  value?: string;
  onChange: (url: string | null) => void;
  label?: string;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    const path = `${workspaceId}/site-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
    setUploading(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    onChange(data.publicUrl);
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-muted">{label}</label>
      {value ? (
        <div className="mt-1.5 flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="max-h-20 rounded-lg border border-border object-contain" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted hover:border-danger hover:text-danger"
          >
            <X size={12} /> Remove
          </button>
        </div>
      ) : (
        <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-slate hover:border-accent hover:text-accent">
          <ImagePlus size={14} />
          {uploading ? "Uploading..." : "Upload"}
          <input type="file" accept="image/*" disabled={uploading} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      )}
    </div>
  );
}
