"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ImagePlus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";

// Workspace-scoped (not per-website) -- anything uploaded here is reusable
// across every website and funnel in the workspace, matching the precedent
// set by BannerImageUpload/BrandCenterForm's workspace-level storage paths.
export function mediaLibraryPrefix(workspaceId: string) {
  return `${workspaceId}/media`;
}

type MediaFile = { name: string; url: string };

export function MediaLibrary({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const supabase = createClient();
  const toast = useToast();
  const prefix = mediaLibraryPrefix(workspaceId);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [copiedName, setCopiedName] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.storage.from("branding").list(prefix, { sortBy: { column: "created_at", order: "desc" } });
    setLoading(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setFiles(
      (data ?? [])
        .filter((f) => f.id)
        .map((f) => ({ name: f.name, url: supabase.storage.from("branding").getPublicUrl(`${prefix}/${f.name}`).data.publicUrl }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(fileList: FileList) {
    setUploading(true);
    for (const file of Array.from(fileList)) {
      const path = `${prefix}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
      if (error) toast.show(error.message, "error");
    }
    setUploading(false);
    load();
  }

  async function remove(name: string) {
    if (!confirm("Delete this file? Anything on your pages still using it will show a broken image.")) return;
    setDeletingName(name);
    const { error } = await supabase.storage.from("branding").remove([`${prefix}/${name}`]);
    setDeletingName(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  async function copyLink(f: MediaFile) {
    await navigator.clipboard.writeText(f.url);
    setCopiedName(f.name);
    setTimeout(() => setCopiedName((cur) => (cur === f.name ? null : cur)), 2000);
  }

  return (
    <div>
      <p className="text-sm text-muted">Banners, logos, and other images -- upload once, reuse on any website or funnel in this workspace. Copy a file&apos;s link to drop it straight into custom HTML.</p>

      {canManage && (
        <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-slate hover:border-accent hover:text-accent">
          <ImagePlus size={14} />
          {uploading ? "Uploading..." : "Upload images"}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            className="hidden"
            onChange={(e) => e.target.files && e.target.files.length > 0 && upload(e.target.files)}
          />
        </label>
      )}

      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : files.length === 0 ? (
          <EmptyState message="No media uploaded yet." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {files.map((f) => (
              <div key={f.name} className="group relative overflow-hidden rounded-xl border border-border bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.name} className="aspect-video w-full object-cover" />
                <div className="flex items-center justify-between gap-1 border-t border-border px-2 py-1">
                  <p className="truncate text-[11px] text-muted">{f.name.replace(/^\d+-/, "")}</p>
                  <button
                    type="button"
                    onClick={() => copyLink(f)}
                    className="shrink-0 text-muted hover:text-accent"
                    title="Copy link"
                    aria-label="Copy link"
                  >
                    {copiedName === f.name ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                  </button>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => remove(f.name)}
                    disabled={deletingName === f.name}
                    className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-60"
                    aria-label="Delete file"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
