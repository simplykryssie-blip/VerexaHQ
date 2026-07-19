"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImagePlus, Save, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";

type BrandProfile = {
  legal_name: string;
  dba_name: string;
  logo_url: string;
  alternate_logo_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  heading_font: string;
  body_font: string;
  logo_alignment: "left" | "center" | "right";
  logo_width: number;
  phone: string;
  email: string;
  website: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postal_code: string;
  document_footer: string;
  legal_disclaimer: string;
  watermark_text: string;
  show_powered_by: boolean;
};

const EMPTY: BrandProfile = {
  legal_name: "",
  dba_name: "",
  logo_url: "",
  alternate_logo_url: "",
  primary_color: "#108A64",
  secondary_color: "#132922",
  accent_color: "#22B8DB",
  heading_font: "Georgia",
  body_font: "Arial",
  logo_alignment: "left",
  logo_width: 180,
  phone: "",
  email: "",
  website: "",
  address_line_1: "",
  address_line_2: "",
  city: "",
  state: "",
  postal_code: "",
  document_footer: "",
  legal_disclaimer: "",
  watermark_text: "",
  show_powered_by: true,
};

export default function BrandCenter() {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const [profile, setProfile] = useState<BrandProfile>(EMPTY);
  const [previewLogo, setPreviewLogo] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolveLogo = useCallback(async (value: string) => {
    if (!value) {
      setPreviewLogo("");
      return;
    }
    if (/^https?:\/\//i.test(value)) {
      setPreviewLogo(value);
      return;
    }
    const { data } = await supabase.storage
      .from("workspace-brand-assets")
      .createSignedUrl(value, 60 * 60);
    setPreviewLogo(data?.signedUrl ?? "");
  }, []);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setError(null);
    const { data, error: loadError } = await supabase
      .from("workspace_brand_profiles")
      .select("*")
      .eq("workspace_id", activeWorkspaceId)
      .maybeSingle();

    if (loadError) {
      setError(loadError.message);
      return;
    }

    const next = {
      ...EMPTY,
      legal_name: activeWorkspace?.name ?? "",
      ...(data ?? {}),
    } as BrandProfile;
    setProfile(next);
    await resolveLogo(next.logo_url);
  }, [activeWorkspaceId, activeWorkspace?.name, resolveLogo]);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof BrandProfile>(key: K, value: BrandProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function uploadLogo(file?: File) {
    if (!file || !activeWorkspaceId) return;
    setUploading(true);
    setError(null);
    setMessage(null);

    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${activeWorkspaceId}/logo-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("workspace-brand-assets")
      .upload(path, file, { upsert: true, cacheControl: "3600" });

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    update("logo_url", path);
    await resolveLogo(path);
    setUploading(false);
    setMessage("Logo uploaded. Save the brand kit to keep this change.");
  }

  async function save() {
    if (!activeWorkspaceId) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    const { error: saveError } = await supabase
      .from("workspace_brand_profiles")
      .upsert(
        {
          workspace_id: activeWorkspaceId,
          ...profile,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id" },
      );

    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setMessage("Brand kit saved. New workspace documents can use this branding.");
  }

  const displayName =
    profile.dba_name || profile.legal_name || activeWorkspace?.name || "Your firm";
  const contactLine = useMemo(
    () => [profile.phone, profile.email, profile.website].filter(Boolean).join(" · "),
    [profile.phone, profile.email, profile.website],
  );
  const address = useMemo(
    () =>
      [
        profile.address_line_1,
        profile.address_line_2,
        [profile.city, profile.state, profile.postal_code].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(" · "),
    [profile],
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
      <section className="app-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-ink">Office Brand Kit</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Set the identity used on documents, forms, invoices, and client-facing materials for this workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving || !activeWorkspaceId}
            className="flex items-center gap-2 rounded-xl bg-[#108A64] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0d7555] disabled:opacity-60"
          >
            <Save size={16} /> {saving ? "Saving…" : "Save brand kit"}
          </button>
        </div>

        {message && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Legal business name"><input className="brand-input" value={profile.legal_name} onChange={(e) => update("legal_name", e.target.value)} /></Field>
          <Field label="DBA / display name"><input className="brand-input" value={profile.dba_name} onChange={(e) => update("dba_name", e.target.value)} /></Field>
          <Field label="Office logo">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line p-4 text-sm font-semibold text-[#108A64] hover:bg-emerald-50">
              <Upload size={17} /> {uploading ? "Uploading…" : "Upload logo"}
              <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={uploading} onChange={(e) => uploadLogo(e.target.files?.[0])} />
            </label>
          </Field>
          <Field label="Logo alignment">
            <select className="brand-input" value={profile.logo_alignment} onChange={(e) => update("logo_alignment", e.target.value as BrandProfile["logo_alignment"])}>
              <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
            </select>
          </Field>
          <ColorField label="Primary color" value={profile.primary_color} onChange={(v) => update("primary_color", v)} />
          <ColorField label="Secondary color" value={profile.secondary_color} onChange={(v) => update("secondary_color", v)} />
          <ColorField label="Accent color" value={profile.accent_color} onChange={(v) => update("accent_color", v)} />
          <Field label="Logo width"><input className="w-full" type="range" min="60" max="300" value={profile.logo_width} onChange={(e) => update("logo_width", Number(e.target.value))} /><div className="mt-1 text-xs text-muted">{profile.logo_width}px</div></Field>
          <Field label="Heading font"><select className="brand-input" value={profile.heading_font} onChange={(e) => update("heading_font", e.target.value)}><option>Georgia</option><option>Arial</option><option>Verdana</option><option>Times New Roman</option></select></Field>
          <Field label="Body font"><select className="brand-input" value={profile.body_font} onChange={(e) => update("body_font", e.target.value)}><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Times New Roman</option></select></Field>
          <Field label="Email"><input className="brand-input" type="email" value={profile.email} onChange={(e) => update("email", e.target.value)} /></Field>
          <Field label="Phone"><input className="brand-input" value={profile.phone} onChange={(e) => update("phone", e.target.value)} /></Field>
          <Field label="Website"><input className="brand-input" value={profile.website} onChange={(e) => update("website", e.target.value)} /></Field>
          <Field label="Street address"><input className="brand-input" value={profile.address_line_1} onChange={(e) => update("address_line_1", e.target.value)} /></Field>
          <Field label="Address line 2"><input className="brand-input" value={profile.address_line_2} onChange={(e) => update("address_line_2", e.target.value)} /></Field>
          <Field label="City"><input className="brand-input" value={profile.city} onChange={(e) => update("city", e.target.value)} /></Field>
          <Field label="State"><input className="brand-input" value={profile.state} onChange={(e) => update("state", e.target.value)} /></Field>
          <Field label="ZIP code"><input className="brand-input" value={profile.postal_code} onChange={(e) => update("postal_code", e.target.value)} /></Field>
          <Field label="Document footer"><textarea className="brand-input min-h-24" value={profile.document_footer} onChange={(e) => update("document_footer", e.target.value)} /></Field>
          <Field label="Legal disclaimer"><textarea className="brand-input min-h-24" value={profile.legal_disclaimer} onChange={(e) => update("legal_disclaimer", e.target.value)} /></Field>
          <Field label="Watermark"><input className="brand-input" value={profile.watermark_text} onChange={(e) => update("watermark_text", e.target.value)} placeholder="DRAFT or CONFIDENTIAL" /></Field>
          <label className="flex items-center gap-3 rounded-xl border border-line p-4 text-sm font-semibold text-ink"><input type="checkbox" checked={profile.show_powered_by} onChange={(e) => update("show_powered_by", e.target.checked)} />Show “Powered by VerexaHQ”</label>
        </div>
      </section>

      <aside className="rounded-2xl border border-line bg-[#edf6f2] p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Live document preview</div>
        <div className="relative min-h-[620px] overflow-hidden rounded-xl bg-white p-8 shadow-sm" style={{ fontFamily: profile.body_font }}>
          {profile.watermark_text && <div className="pointer-events-none absolute inset-0 grid -rotate-45 place-items-center text-5xl font-bold opacity-[0.04]">{profile.watermark_text}</div>}
          <div className={`flex ${profile.logo_alignment === "center" ? "justify-center" : profile.logo_alignment === "right" ? "justify-end" : "justify-start"}`}>
            {previewLogo ? <img src={previewLogo} alt="Office logo" style={{ width: profile.logo_width, maxHeight: 100, objectFit: "contain" }} /> : <div className="grid h-20 w-40 place-items-center rounded-xl border border-dashed border-line text-muted"><ImagePlus size={24} /></div>}
          </div>
          <div className="mt-6 h-1 rounded-full" style={{ backgroundColor: profile.primary_color }} />
          <h3 className="mt-8 text-2xl font-bold" style={{ fontFamily: profile.heading_font, color: profile.secondary_color }}>Engagement Letter</h3>
          <p className="mt-5 text-sm leading-7 text-slate-700">Dear Client,</p>
          <p className="mt-3 text-sm leading-7 text-slate-700">Thank you for choosing <strong>{displayName}</strong>. This preview shows how your workspace branding will appear on generated documents.</p>
          <div className="mt-10 rounded-lg p-4 text-sm" style={{ backgroundColor: `${profile.primary_color}12`, border: `1px solid ${profile.primary_color}35` }}>Branded callouts and signature areas use your selected colors.</div>
          {profile.legal_disclaimer && <p className="mt-8 text-[10px] leading-5 text-muted">{profile.legal_disclaimer}</p>}
          <div className="absolute bottom-8 left-8 right-8 border-t pt-4 text-center text-[10px] text-muted"><div>{profile.document_footer || contactLine}</div><div className="mt-1">{address}</div>{profile.show_powered_by && <div className="mt-2">Powered by VerexaHQ</div>}</div>
        </div>
      </aside>
      <style jsx>{`.brand-input{width:100%;border:1px solid var(--line);border-radius:.75rem;padding:.7rem .8rem;font-size:.875rem;background:#fff;outline:none}.brand-input:focus{border-color:#108a64;box-shadow:0 0 0 3px rgba(16,138,100,.12)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted">{label}</span>{children}</label>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><div className="flex gap-2"><input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-14 rounded-lg border border-line p-1" /><input className="brand-input" value={value} onChange={(e) => onChange(e.target.value)} /></div></Field>;
}
