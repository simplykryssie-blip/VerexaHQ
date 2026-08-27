"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { getReadableTextColor } from "@/lib/color";

type Props = {
  workspaceId: string;
  isOwner: boolean;
  isWhitelabeledByEro: boolean;
  eroName: string | null;
  businessName: string | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  sidebarBgColor: string | null;
};

const DEFAULT_SIDEBAR_BG = "#ffffff";

export function BrandCenterForm({
  workspaceId,
  isOwner,
  isWhitelabeledByEro,
  eroName,
  businessName,
  logoUrl,
  primaryColor,
  secondaryColor,
  sidebarBgColor,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [bizName, setBizName] = useState(businessName ?? "");
  const [logo, setLogo] = useState(logoUrl);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [primary, setPrimary] = useState(primaryColor);
  const [secondary, setSecondary] = useState(secondaryColor);
  const [navBg, setNavBg] = useState(sidebarBgColor ?? DEFAULT_SIDEBAR_BG);
  const [useCustomNavBg, setUseCustomNavBg] = useState(Boolean(sidebarBgColor));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadLogo(file: File) {
    setUploadingLogo(true);
    const path = `${workspaceId}/sidebar-logo-${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
    setUploadingLogo(false);
    if (uploadErr) {
      toast.show(uploadErr.message, "error");
      return;
    }
    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    setLogo(data.publicUrl);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase.from("branding").upsert(
      {
        workspace_id: workspaceId,
        display_name: bizName || null,
        sidebar_logo_url: logo,
        primary_color: primary,
        secondary_color: secondary,
        sidebar_bg_color: useCustomNavBg ? navBg : null,
      },
      { onConflict: "workspace_id" }
    );

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    toast.show("Saved", "success");
    router.refresh();
  }

  if (isWhitelabeledByEro) {
    return (
      <SettingsCard title="Brand Center" description="Your logo, colors, and business name.">
        <p className="text-sm text-slate">
          Your logo, colors, and business name are managed by {eroName ?? "your ERO"} -- your staff dashboard and your clients&apos; portal both show their
          branding. If something looks wrong, contact them to have it updated.
        </p>
      </SettingsCard>
    );
  }

  if (!isOwner) return null;

  const previewTextColor = getReadableTextColor(useCustomNavBg ? navBg : DEFAULT_SIDEBAR_BG);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SettingsCard title="Identity" description="Your logo and business name, shown across the staff dashboard and client portal.">
        <div className="flex items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- external, per-workspace logo URL; not part of the Next.js image pipeline.
            <img src={logo} alt="" className="h-12 w-12 rounded-lg border border-border object-contain" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted">Logo</div>
          )}
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent">
              <UploadCloud size={13} />
              {uploadingLogo ? "Uploading..." : logo ? "Replace logo" : "Upload logo"}
              <input type="file" accept="image/*" disabled={uploadingLogo} onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} className="sr-only" />
            </label>
            {logo && (
              <button type="button" onClick={() => setLogo(null)} className="text-xs font-medium text-muted hover:text-danger" aria-label="Remove logo">
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4">
          <label className="block">
            <span className="block text-sm font-medium text-slate">Business name</span>
            <input
              value={bizName}
              onChange={(e) => setBizName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
        </div>
      </SettingsCard>

      <SettingsCard title="Colors" description="Drives the sidebar's active state, portal badges, and public forms.">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm font-medium text-slate">Accent color</span>
            <div className="mt-1 flex items-center gap-2">
              <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-9 w-14 rounded border border-border" />
              <span className="font-mono text-xs text-muted">{secondary}</span>
            </div>
            <span className="mt-1 block text-xs text-muted">Drives your sidebar&apos;s active state and the badges clients see on your portal.</span>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-slate">Fallback accent color</span>
            <div className="mt-1 flex items-center gap-2">
              <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-9 w-14 rounded border border-border" />
              <span className="font-mono text-xs text-muted">{primary}</span>
            </div>
            <span className="mt-1 block text-xs text-muted">Only used on public forms if Accent color above is left unset.</span>
          </label>
        </div>
      </SettingsCard>

      <SettingsCard title="Nav bar" description="Recolor your own staff sidebar. Text stays readable automatically, no matter what color you pick.">
        <label className="flex items-center gap-2 text-sm font-medium text-slate">
          <input type="checkbox" checked={useCustomNavBg} onChange={(e) => setUseCustomNavBg(e.target.checked)} className="h-4 w-4 rounded border-border" />
          Use a custom nav bar color
        </label>

        {useCustomNavBg && (
          <div className="mt-3 flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input type="color" value={navBg} onChange={(e) => setNavBg(e.target.value)} className="h-9 w-14 rounded border border-border" />
              <span className="font-mono text-xs text-muted">{navBg}</span>
            </label>
            <span
              className="rounded-lg px-3 py-2 text-xs font-medium"
              style={{ background: navBg, color: previewTextColor }}
            >
              Nav preview
            </span>
          </div>
        )}
        {!useCustomNavBg && <p className="mt-2 text-xs text-muted">Default: a light sidebar.</p>}
      </SettingsCard>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
