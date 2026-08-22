"use client";

import { useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

/** Letterhead-style banner image, uploaded once and rendered at the top of
 * the document/form -- separate from the firm's sidebar logo (Firm Profile
 * settings), since staff may want a purpose-made banner (e.g. designed
 * outside Verexa) rather than reusing the firm's everyday logo. Reuses the
 * same public `branding` storage bucket and admin-only upload policy as the
 * firm logo, just under its own path prefix. */
export function BannerImageUpload({
  workspaceId,
  value,
  onChange,
  disabled,
}: {
  workspaceId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    const path = `${workspaceId}/banner-${Date.now()}-${file.name}`;
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
      <label className="block text-xs font-medium uppercase tracking-wide text-muted">Banner / letterhead image</label>
      {value ? (
        <div className="mt-2 flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Banner" className="max-h-24 rounded-lg border border-border object-contain" />
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:border-danger hover:text-danger"
            >
              <X size={12} /> Remove
            </button>
          )}
        </div>
      ) : (
        !disabled && (
          <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-slate hover:border-accent hover:text-accent">
            <ImagePlus size={14} />
            {uploading ? "Uploading..." : "Upload a banner image"}
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>
        )
      )}
      <p className="mt-1 text-xs text-muted">Rendered at the top of the document -- upload something you designed elsewhere.</p>
    </div>
  );
}
