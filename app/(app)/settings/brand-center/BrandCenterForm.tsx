"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Branding = {
  display_name: string | null;
  dba: string | null;
  sidebar_logo_url?: string | null;
  portal_logo_url?: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  sidebar_text_color?: string | null;
  support_email: string | null;
  support_phone: string | null;
} | null;

function LogoUploadField({
  workspaceId,
  column,
  pathPrefix,
  label,
  helpText,
  initialUrl,
}: {
  workspaceId: string;
  column: "sidebar_logo_url" | "portal_logo_url";
  pathPrefix: string;
  label: string;
  helpText: string;
  initialUrl: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [logoUrl, setLogoUrl] = useState(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadLogo(file: File) {
    setUploading(true);
    setError(null);
    const path = `${workspaceId}/${pathPrefix}-${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
    if (uploadErr) {
      setUploading(false);
      setError(uploadErr.message);
      return;
    }
    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    const { error: updateErr } = await supabase
      .from("branding")
      .upsert({ workspace_id: workspaceId, [column]: data.publicUrl } as Record<"workspace_id" | typeof column, string>, {
        onConflict: "workspace_id",
      });
    setUploading(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setLogoUrl(data.publicUrl);
    router.refresh();
  }

  async function removeLogo() {
    setUploading(true);
    const { error: updateErr } = await supabase
      .from("branding")
      .upsert({ workspace_id: workspaceId, [column]: null } as { workspace_id: string } & Record<typeof column, null>, {
        onConflict: "workspace_id",
      });
    setUploading(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setLogoUrl(null);
    router.refresh();
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate">{label}</label>
      <p className="mt-0.5 text-xs text-muted">{helpText}</p>
      <div className="mt-2 flex items-center gap-3">
        {logoUrl && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surfaceMuted px-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Current logo" style={{ maxHeight: "28px", maxWidth: "140px", objectFit: "contain" }} />
            <button type="button" onClick={removeLogo} disabled={uploading} className="text-muted hover:text-danger" aria-label={`Remove ${label.toLowerCase()}`}>
              <X size={14} />
            </button>
          </div>
        )}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent">
          <UploadCloud size={13} />
          {uploading ? "Uploading..." : logoUrl ? "Replace logo" : "Upload logo"}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
            className="sr-only"
          />
        </label>
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function BrandCenterForm({ workspaceId, branding }: { workspaceId: string; branding: Branding }) {
  const router = useRouter();
  const supabase = createClient();
  const [displayName, setDisplayName] = useState(branding?.display_name ?? "");
  const [supportEmail, setSupportEmail] = useState(branding?.support_email ?? "");
  const [primaryColor, setPrimaryColor] = useState(branding?.primary_color ?? "#0F172A");
  const [secondaryColor, setSecondaryColor] = useState(branding?.secondary_color ?? "#2563EB");
  const [textColor, setTextColor] = useState(branding?.sidebar_text_color ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const { error } = await supabase.from("branding").upsert(
      {
        workspace_id: workspaceId,
        display_name: displayName || null,
        support_email: supportEmail || null,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        sidebar_text_color: textColor || null,
      },
      { onConflict: "workspace_id" }
    );

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
      <LogoUploadField
        workspaceId={workspaceId}
        column="sidebar_logo_url"
        pathPrefix="sidebar-logo"
        label="Sidebar logo"
        helpText="Shown at the top of your staff dashboard's navigation bar."
        initialUrl={branding?.sidebar_logo_url ?? null}
      />
      <LogoUploadField
        workspaceId={workspaceId}
        column="portal_logo_url"
        pathPrefix="portal-logo"
        label="Client portal logo"
        helpText="Shown to your clients in their portal. Leave blank to reuse the sidebar logo."
        initialUrl={branding?.portal_logo_url ?? null}
      />

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
      <p className="text-xs text-muted">Nav bar color and button color apply across both your staff dashboard and your client portal.</p>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate">
          <input
            type="checkbox"
            checked={textColor !== ""}
            onChange={(e) => setTextColor(e.target.checked ? "#F4F4F6" : "")}
            className="h-4 w-4 rounded border-border"
          />
          Override nav text color
        </label>
        <p className="mt-0.5 text-xs text-muted">
          Turn this on if a light nav bar color makes the menu text hard to read. Only affects the staff sidebar&apos;s text -- not buttons or
          the rest of the app.
        </p>
        {textColor !== "" && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              className="h-9 w-14 rounded border border-border"
            />
            <span className="text-sm text-muted">{textColor}</span>
          </div>
        )}
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
