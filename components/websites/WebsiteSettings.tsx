"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, ImagePlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";
const textareaClass =
  "mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

type Website = {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  favicon_url: string | null;
  head_tracking_code: string | null;
  body_tracking_code: string | null;
};

export function WebsiteSettings({ website, canManage }: { website: Website; canManage: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [name, setName] = useState(website.name);
  const [slug, setSlug] = useState(website.slug);
  const [faviconUrl, setFaviconUrl] = useState(website.favicon_url ?? "");
  const [headCode, setHeadCode] = useState(website.head_tracking_code ?? "");
  const [bodyCode, setBodyCode] = useState(website.body_tracking_code ?? "");
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function uploadFavicon(file: File) {
    setUploadingFavicon(true);
    const path = `${website.workspace_id}/favicon-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
    setUploadingFavicon(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    setFaviconUrl(data.publicUrl);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("site_websites")
      .update({
        name: name.trim() || website.name,
        slug: slug.trim() || website.slug,
        favicon_url: faviconUrl || null,
        head_tracking_code: headCode || null,
        body_tracking_code: bodyCode || null,
      })
      .eq("id", website.id);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setDirty(false);
    toast.show("Saved", "success");
    router.refresh();
  }

  async function deleteWebsite() {
    if (!confirm("Delete this website? All its pages and funnels will be deleted too. This can't be undone.")) return;
    const { error } = await supabase.from("site_websites").delete().eq("id", website.id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.push("/websites");
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <label className={labelClass}>
          Name
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            disabled={!canManage}
            className={inputClass}
          />
        </label>
        <label className={`${labelClass} mt-3`}>
          URL slug
          <input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setDirty(true);
            }}
            disabled={!canManage}
            className={inputClass}
          />
        </label>

        <div className="mt-3">
          <p className={labelClass}>Favicon</p>
          {faviconUrl ? (
            <div className="mt-1.5 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={faviconUrl} alt="" className="h-6 w-6 rounded border border-border object-contain" />
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setFaviconUrl("");
                    setDirty(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted hover:border-danger hover:text-danger"
                >
                  <X size={12} /> Remove
                </button>
              )}
            </div>
          ) : (
            canManage && (
              <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-slate hover:border-accent hover:text-accent">
                <ImagePlus size={14} />
                {uploadingFavicon ? "Uploading..." : "Upload a favicon"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingFavicon}
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadFavicon(e.target.files[0])}
                />
              </label>
            )
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Tracking & scripts</p>
        <p className="mt-1 text-[11px] text-muted">Add third-party tracking/analytics code (Google Analytics, GTM, Facebook Pixel, custom scripts).</p>
        <label className={`${labelClass} mt-3`}>
          Head tracking code
          <textarea
            value={headCode}
            onChange={(e) => {
              setHeadCode(e.target.value);
              setDirty(true);
            }}
            disabled={!canManage}
            rows={4}
            spellCheck={false}
            className={textareaClass}
          />
        </label>
        <label className={`${labelClass} mt-3`}>
          Body tracking code
          <textarea
            value={bodyCode}
            onChange={(e) => {
              setBodyCode(e.target.value);
              setDirty(true);
            }}
            disabled={!canManage}
            rows={4}
            spellCheck={false}
            className={textareaClass}
          />
        </label>
      </div>

      {canManage && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={deleteWebsite}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-danger hover:border-danger"
          >
            <Trash2 size={13} /> Delete website
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
