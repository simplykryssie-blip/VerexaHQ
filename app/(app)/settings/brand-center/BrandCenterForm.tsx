"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Branding = {
  display_name: string | null;
  dba: string | null;
  sidebar_logo_url?: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  support_email: string | null;
  support_phone: string | null;
} | null;

export function BrandCenterForm({ workspaceId, branding }: { workspaceId: string; branding: Branding }) {
  const router = useRouter();
  const supabase = createClient();
  const [displayName, setDisplayName] = useState(branding?.display_name ?? "");
  const [supportEmail, setSupportEmail] = useState(branding?.support_email ?? "");
  const [primaryColor, setPrimaryColor] = useState(branding?.primary_color ?? "#0F172A");
  const [secondaryColor, setSecondaryColor] = useState(branding?.secondary_color ?? "#2563EB");
  const [logoUrl, setLogoUrl] = useState(branding?.sidebar_logo_url ?? null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function uploadLogo(file: File) {
    setUploadingLogo(true);
    setError(null);
    const path = `${workspaceId}/sidebar-logo-${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
    if (uploadErr) {
      setUploadingLogo(false);
      setError(uploadErr.message);
      return;
    }
    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    const { error: updateErr } = await supabase
      .from("branding")
      .update({ sidebar_logo_url: data.publicUrl })
      .eq("workspace_id", workspaceId);
    setUploadingLogo(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setLogoUrl(data.publicUrl);
    router.refresh();
  }

  async function removeLogo() {
    setUploadingLogo(true);
    const { error: updateErr } = await supabase.from("branding").update({ sidebar_logo_url: null }).eq("workspace_id", workspaceId);
    setUploadingLogo(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setLogoUrl(null);
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const { error } = await supabase
      .from("branding")
      .update({
        display_name: displayName || null,
        support_email: supportEmail || null,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
      })
      .eq("workspace_id", workspaceId);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate">Sidebar logo</label>
        <p className="mt-0.5 text-xs text-muted">Shown at the top of your staff dashboard&apos;s navigation bar.</p>
        <div className="mt-2 flex items-center gap-3">
          {logoUrl && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surfaceMuted px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Current logo" style={{ maxHeight: "28px", maxWidth: "140px", objectFit: "contain" }} />
              <button type="button" onClick={removeLogo} disabled={uploadingLogo} className="text-muted hover:text-danger" aria-label="Remove logo">
                <X size={14} />
              </button>
            </div>
          )}
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent">
            <UploadCloud size={13} />
            {uploadingLogo ? "Uploading..." : logoUrl ? "Replace logo" : "Upload logo"}
            <input
              type="file"
              accept="image/*"
              disabled={uploadingLogo}
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
              className="sr-only"
            />
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate">Display name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate">Support email</label>
        <input
          type="email"
          value={supportEmail}
          onChange={(e) => setSupportEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate">Nav bar color</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-9 w-14 rounded border border-border"
            />
            <span className="text-sm text-muted">{primaryColor}</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate">Button color</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="h-9 w-14 rounded border border-border"
            />
            <span className="text-sm text-muted">{secondaryColor}</span>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && !error && <p className="text-sm text-success">Saved.</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
