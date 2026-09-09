"use client";

import { useState } from "react";
import { Check, Copy, ImagePlus, X, FolderOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { mediaLibraryPrefix } from "@/components/websites/MediaLibrary";

type LibraryFile = { name: string; url: string };

// Uploads land in the same workspace-level "branding" bucket prefix the
// Media Library tab (MediaLibrary.tsx) manages, so anything uploaded here
// shows up there (and on every other website/funnel in the workspace) and
// vice versa -- one shared media library, not one per website.
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
  const prefix = mediaLibraryPrefix(workspaceId);
  const [uploading, setUploading] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [libraryFiles, setLibraryFiles] = useState<LibraryFile[] | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [copiedName, setCopiedName] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    const path = `${prefix}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
    setUploading(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    onChange(data.publicUrl);
  }

  async function openLibrary() {
    setBrowsing(true);
    if (libraryFiles !== null) return;
    setLoadingLibrary(true);
    const { data, error } = await supabase.storage.from("branding").list(prefix, { sortBy: { column: "created_at", order: "desc" } });
    setLoadingLibrary(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setLibraryFiles(
      (data ?? [])
        .filter((f) => f.id)
        .map((f) => ({ name: f.name, url: supabase.storage.from("branding").getPublicUrl(`${prefix}/${f.name}`).data.publicUrl }))
    );
  }

  async function copyLink(f: LibraryFile, e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(f.url);
    setCopiedName(f.name);
    setTimeout(() => setCopiedName((cur) => (cur === f.name ? null : cur)), 2000);
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
        <div className="mt-1.5 flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-slate hover:border-accent hover:text-accent">
            <ImagePlus size={14} />
            {uploading ? "Uploading..." : "Upload"}
            <input type="file" accept="image/*" disabled={uploading} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          <button
            type="button"
            onClick={openLibrary}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-slate hover:border-accent hover:text-accent"
          >
            <FolderOpen size={14} />
            Browse library
          </button>
        </div>
      )}

      {browsing && (
        <div className="mt-2 rounded-lg border border-border bg-surface p-2">
          {loadingLibrary ? (
            <p className="p-2 text-xs text-muted">Loading...</p>
          ) : !libraryFiles || libraryFiles.length === 0 ? (
            <p className="p-2 text-xs text-muted">No media uploaded yet -- upload one above, or add some from the workspace&apos;s Media Library.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {libraryFiles.map((f) => (
                <div key={f.name} className="group relative overflow-hidden rounded-lg border border-border hover:border-accent">
                  <button
                    type="button"
                    onClick={() => {
                      onChange(f.url);
                      setBrowsing(false);
                    }}
                    className="block w-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={f.name} className="aspect-video w-full object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => copyLink(f, e)}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                    title="Copy link"
                    aria-label="Copy link"
                  >
                    {copiedName === f.name ? <Check size={11} /> : <Copy size={11} />}
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setBrowsing(false)} className="mt-2 text-xs font-medium text-muted hover:text-ink">
            Close
          </button>
        </div>
      )}
    </div>
  );
}
