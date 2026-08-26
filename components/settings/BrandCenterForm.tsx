"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { readableTextColor } from "@/lib/color";

function LogoUploader({
  label,
  helpText,
  logo,
  onChange,
  workspaceId,
  pathPrefix,
}: {
  label: string;
  helpText: string;
  logo: string | null;
  onChange: (url: string | null) => void;
  workspaceId: string;
  pathPrefix: string;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    const path = `${workspaceId}/${pathPrefix}-${Date.now()}-${file.name}`;
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
      <span className="block text-sm font-medium text-slate">{label}</span>
      <div className="mt-1.5 flex items-center gap-3">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, per-workspace logo URL; not part of the Next.js image pipeline.
          <img src={logo} alt="" className="h-12 w-12 rounded-lg border border-border object-contain" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted">Logo</div>
        )}
        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent">
            <UploadCloud size={13} />
            {uploading ? "Uploading..." : logo ? "Replace" : "Upload"}
            <input type="file" accept="image/*" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} className="sr-only" />
          </label>
          {logo && (
            <button type="button" onClick={() => onChange(null)} className="text-xs font-medium text-muted hover:text-danger" aria-label={`Remove ${label.toLowerCase()}`}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">{helpText}</p>
    </div>
  );
}

function LivePreview({
  workspaceName,
  logo,
  accent,
  sidebarBg,
  sidebarText,
}: {
  workspaceName: string;
  logo: string | null;
  accent: string;
  sidebarBg: string | null;
  sidebarText: string;
}) {
  const sidebarBgStyle = sidebarBg ?? "#FFFFFF";
  const sidebarMuted = sidebarBg ? (sidebarText === "#FFFFFF" ? "rgba(255,255,255,0.65)" : "#64748B") : "#64748B";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Staff sidebar</p>
        <div className="mt-1.5 overflow-hidden rounded-xl border border-border shadow-soft" style={{ backgroundColor: sidebarBgStyle }}>
          <div className="flex items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: sidebarBg ? `${sidebarText}22` : undefined }}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-5 w-5 rounded object-contain" />
            ) : (
              <div className="h-5 w-5 shrink-0 rounded bg-surfaceMuted" />
            )}
            <span className="truncate text-xs font-semibold" style={{ color: sidebarText }}>
              {workspaceName}
            </span>
          </div>
          <div className="space-y-1 p-2">
            <div className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold" style={{ backgroundColor: `${accent}1a`, color: accent }}>
              Dashboard
            </div>
            <div className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium" style={{ color: sidebarMuted }}>
              Contacts
            </div>
            <div className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium" style={{ color: sidebarMuted }}>
              Engagements
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Client portal</p>
        <div className="mt-1.5 overflow-hidden rounded-xl border border-border bg-surface shadow-soft">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-5 w-5 rounded object-contain" />
            ) : (
              <div className="h-5 w-5 shrink-0 rounded bg-surfaceMuted" />
            )}
            <span className="truncate text-xs font-semibold text-ink">{workspaceName}</span>
          </div>
          <div className="p-3">
            <p className="text-[11px] font-medium text-muted">Welcome back</p>
            <button type="button" disabled className="mt-2 w-full rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white" style={{ backgroundColor: accent }}>
              View my documents
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type TextMode = "auto" | "light" | "dark";

export function BrandCenterForm({
  workspaceId,
  workspaceName,
  businessName,
  sidebarLogoUrl,
  portalLogoUrl,
  primaryColor,
  secondaryColor,
  sidebarBgColor,
  sidebarTextColor,
  isOwner,
  isWhitelabeledByEro,
  allowsBrandingOverride,
  eroName,
}: {
  workspaceId: string;
  workspaceName: string;
  businessName: string | null;
  sidebarLogoUrl: string | null;
  portalLogoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  /** Raw stored value -- null means "use the default light sidebar." */
  sidebarBgColor: string | null;
  /** Raw stored override -- null means "auto-pick for contrast." */
  sidebarTextColor: string | null;
  isOwner: boolean;
  isWhitelabeledByEro: boolean;
  allowsBrandingOverride: boolean;
  eroName: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [bizName, setBizName] = useState(businessName ?? "");
  const [sidebarLogo, setSidebarLogo] = useState(sidebarLogoUrl);
  const [portalLogo, setPortalLogo] = useState(portalLogoUrl);
  const [primary, setPrimary] = useState(primaryColor);
  const [secondary, setSecondary] = useState(secondaryColor);
  const [customSidebar, setCustomSidebar] = useState(Boolean(sidebarBgColor));
  const [sidebarBg, setSidebarBg] = useState(sidebarBgColor ?? "#0F172A");
  const [textMode, setTextMode] = useState<TextMode>(sidebarTextColor === "#FFFFFF" ? "light" : sidebarTextColor === "#0F172A" ? "dark" : "auto");
  const [saving, setSaving] = useState(false);

  const editable = isOwner && (!isWhitelabeledByEro || allowsBrandingOverride);
  const resolvedSidebarText =
    textMode === "light" ? "#FFFFFF" : textMode === "dark" ? "#0F172A" : readableTextColor(customSidebar ? sidebarBg : "#FFFFFF");

  async function handleSave() {
    setSaving(true);
    const patch: {
      workspace_id: string;
      display_name?: string | null;
      sidebar_logo_url: string | null;
      portal_logo_url: string | null;
      primary_color: string;
      secondary_color: string;
      sidebar_bg_color: string | null;
      sidebar_text_color: string | null;
    } = {
      workspace_id: workspaceId,
      sidebar_logo_url: sidebarLogo,
      portal_logo_url: portalLogo,
      primary_color: primary,
      secondary_color: secondary,
      sidebar_bg_color: customSidebar ? sidebarBg : null,
      sidebar_text_color: customSidebar && textMode !== "auto" ? resolvedSidebarText : null,
    };
    if (!isWhitelabeledByEro) patch.display_name = bizName || null;
    const { error } = await supabase.from("branding").upsert(patch, { onConflict: "workspace_id" });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Saved", "success");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {isWhitelabeledByEro && !allowsBrandingOverride && (
        <SettingsCard title="Managed by your ERO">
          <p className="text-sm text-slate">
            Your logo, colors, and business name are managed by {eroName ?? "your ERO"} -- your staff dashboard and your clients&apos; portal both show
            their branding. If something looks wrong, contact them to have it updated.
          </p>
        </SettingsCard>
      )}

      {!isOwner && (
        <SettingsCard title="Owner-only">
          <p className="text-sm text-slate">Only the workspace owner can edit branding. Here&apos;s what&apos;s currently set.</p>
        </SettingsCard>
      )}

      <SettingsCard
        title="Logo & colors"
        description={
          isWhitelabeledByEro
            ? `${eroName ?? "Your ERO"} has let you set your own logo and accent color -- your business name and support contact still come from them.`
            : "Shown on your staff sidebar and everything your clients see."
        }
      >
        {!isWhitelabeledByEro && (
          <div className="mb-4">
            <label className="block">
              <span className="block text-sm font-medium text-slate">Business name</span>
              <input
                value={bizName}
                disabled={!editable}
                onChange={(e) => setBizName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted"
              />
            </label>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LogoUploader
            label="Sidebar logo"
            helpText="Shown to your staff, top-left of the dashboard."
            logo={sidebarLogo}
            onChange={editable ? setSidebarLogo : () => {}}
            workspaceId={workspaceId}
            pathPrefix="sidebar-logo"
          />
          <LogoUploader
            label="Portal logo (optional)"
            helpText="Shown to clients on their portal. Leave blank to reuse the sidebar logo."
            logo={portalLogo}
            onChange={editable ? setPortalLogo : () => {}}
            workspaceId={workspaceId}
            pathPrefix="portal-logo"
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm font-medium text-slate">Button &amp; accent color</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={secondary}
                disabled={!editable}
                onChange={(e) => setSecondary(e.target.value)}
                className="h-9 w-14 rounded border border-border disabled:opacity-60"
              />
              <span className="font-mono text-xs text-muted">{secondary}</span>
            </div>
            <span className="mt-1 block text-xs text-muted">
              This is your button color everywhere -- every primary button, link, and active nav state, on your staff dashboard and your clients&apos;
              portal alike.
            </span>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-slate">Fallback accent color</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={primary}
                disabled={!editable}
                onChange={(e) => setPrimary(e.target.value)}
                className="h-9 w-14 rounded border border-border disabled:opacity-60"
              />
              <span className="font-mono text-xs text-muted">{primary}</span>
            </div>
            <span className="mt-1 block text-xs text-muted">Only used on public forms if Button &amp; accent color above is left unset.</span>
          </label>
        </div>
      </SettingsCard>

      <SettingsCard title="Sidebar appearance" description="Recolor the staff sidebar itself, not just its accent.">
        <button
          type="button"
          role="switch"
          aria-checked={customSidebar}
          disabled={!editable}
          onClick={() => setCustomSidebar((v) => !v)}
          className={`relative h-6 w-11 shrink-0 rounded-full border transition disabled:opacity-60 ${
            customSidebar ? "border-accent bg-accent" : "border-border bg-border"
          }`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${customSidebar ? "left-[22px]" : "left-0.5"}`} />
        </button>
        <span className="ml-2.5 align-middle text-sm font-medium text-slate">Custom sidebar background</span>

        {customSidebar && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="block text-sm font-medium text-slate">Background color</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={sidebarBg}
                  disabled={!editable}
                  onChange={(e) => setSidebarBg(e.target.value)}
                  className="h-9 w-14 rounded border border-border disabled:opacity-60"
                />
                <span className="font-mono text-xs text-muted">{sidebarBg}</span>
              </div>
            </label>

            <div>
              <span className="block text-sm font-medium text-slate">Text</span>
              <div className="mt-1 flex overflow-hidden rounded-lg border border-border">
                {(["auto", "light", "dark"] as const).map((mode, i) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={!editable}
                    onClick={() => setTextMode(mode)}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium capitalize transition disabled:cursor-not-allowed ${
                      i > 0 ? "border-l border-border" : ""
                    } ${textMode === mode ? "bg-accent text-white" : "bg-surface text-slate hover:bg-surfaceMuted"}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <span className="mt-1 block text-xs text-muted">Auto picks white or dark text for readability against your background.</span>
            </div>
          </div>
        )}
      </SettingsCard>

      {editable && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Live preview</p>
        <div className="mt-1.5">
          <LivePreview
            workspaceName={bizName || workspaceName}
            logo={sidebarLogo}
            accent={secondary}
            sidebarBg={customSidebar ? sidebarBg : null}
            sidebarText={resolvedSidebarText}
          />
        </div>
      </div>
    </div>
  );
}
