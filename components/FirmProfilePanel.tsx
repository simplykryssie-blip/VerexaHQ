"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Pencil, Save, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { friendlyError } from "@/lib/friendlyError";

type FirmProfile = {
  business_legal_name: string;
  brand_name: string;
  business_email: string;
  business_phone: string;
  business_website: string;
  business_type: string;
  primary_service_type: string;
  business_address_line1: string;
  business_address_line2: string;
  business_city: string;
  business_state: string;
  business_postal_code: string;
  default_timezone: string;
  business_ein: string;
};

const EMPTY: FirmProfile = {
  business_legal_name: "",
  brand_name: "",
  business_email: "",
  business_phone: "",
  business_website: "",
  business_type: "",
  primary_service_type: "",
  business_address_line1: "",
  business_address_line2: "",
  business_city: "",
  business_state: "",
  business_postal_code: "",
  default_timezone: "America/Chicago",
  business_ein: "",
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+$/i;
const STATE_RE = /^[A-Za-z]{2}$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const PHONE_RE = /^[\d\s()+.-]{7,20}$/;

export default function FirmProfilePanel() {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const canEdit = activeWorkspace?.role === "Owner" || activeWorkspace?.role === "Admin";

  const [saved, setSaved] = useState<FirmProfile>(EMPTY);
  const [draft, setDraft] = useState<FirmProfile>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEin, setShowEin] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("workspace_settings")
      .select(
        "business_legal_name,brand_name,business_email,business_phone,business_website,business_type,primary_service_type,business_address_line1,business_address_line2,business_city,business_state,business_postal_code,default_timezone,business_ein",
      )
      .eq("workspace_id", activeWorkspaceId)
      .maybeSingle();
    if (loadError) {
      setError(friendlyError(loadError, "Couldn't load your firm profile."));
      setLoading(false);
      return;
    }
    const next = { ...EMPTY, ...(data ?? {}) } as FirmProfile;
    setSaved(next);
    setDraft(next);
    setLoading(false);
  }, [activeWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof FirmProfile>(key: K, value: FirmProfile[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function validate(next: FirmProfile): Record<string, string> {
    const errors: Record<string, string> = {};
    if (next.business_email && !EMAIL_RE.test(next.business_email)) {
      errors.business_email = "Enter a valid email address.";
    }
    if (next.business_phone && !PHONE_RE.test(next.business_phone)) {
      errors.business_phone = "Enter a valid phone number.";
    }
    if (next.business_website && !URL_RE.test(next.business_website)) {
      errors.business_website = "Enter a full URL, starting with http:// or https://.";
    }
    if (next.business_state && !STATE_RE.test(next.business_state)) {
      errors.business_state = "Use a 2-letter state code, e.g. TX.";
    }
    if (next.business_postal_code && !ZIP_RE.test(next.business_postal_code)) {
      errors.business_postal_code = "Enter a valid ZIP code.";
    }
    return errors;
  }

  function startEdit() {
    setDraft(saved);
    setFieldErrors({});
    setError(null);
    setSuccess(null);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(saved);
    setFieldErrors({});
    setEditing(false);
  }

  async function save() {
    if (!activeWorkspaceId || saving) return;
    const errors = validate(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    const payload = {
      workspace_id: activeWorkspaceId,
      business_legal_name: draft.business_legal_name.trim() || null,
      brand_name: draft.brand_name.trim() || null,
      business_email: draft.business_email.trim() || null,
      business_phone: draft.business_phone.trim() || null,
      business_website: draft.business_website.trim() || null,
      business_type: draft.business_type.trim() || null,
      primary_service_type: draft.primary_service_type.trim() || null,
      business_address_line1: draft.business_address_line1.trim() || null,
      business_address_line2: draft.business_address_line2.trim() || null,
      business_city: draft.business_city.trim() || null,
      business_state: draft.business_state.trim().toUpperCase() || null,
      business_postal_code: draft.business_postal_code.trim() || null,
      default_timezone: draft.default_timezone || "America/Chicago",
      business_ein: draft.business_ein.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await supabase
      .from("workspace_settings")
      .upsert(payload, { onConflict: "workspace_id" });
    setSaving(false);
    if (saveError) {
      setError(friendlyError(saveError, "Couldn't save your firm profile. Check your role and try again."));
      return;
    }
    setSaved(draft);
    setEditing(false);
    setSuccess("Firm profile saved.");
  }

  if (loading) return <p className="text-sm text-muted">Loading firm profile…</p>;

  const maskedEin = saved.business_ein ? `••-•${saved.business_ein.slice(-4)}` : "";

  return (
    <section className="max-w-3xl rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-ink">Firm profile</h2>
        {!editing && canEdit && (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper"
          >
            <Pencil size={14} /> Edit
          </button>
        )}
      </div>
      {!canEdit && (
        <p className="mt-1 text-xs text-muted">Only the Account Owner or an Admin can edit the firm profile.</p>
      )}

      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && !editing && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>
      )}

      {!editing ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Legal business name" value={saved.business_legal_name} />
          <Field label="Display/business name" value={saved.brand_name} />
          <Field label="Primary email" value={saved.business_email} />
          <Field label="Primary phone" value={saved.business_phone} />
          <Field label="Website" value={saved.business_website} />
          <Field label="Business type" value={saved.business_type} />
          <Field label="Primary service" value={saved.primary_service_type} />
          <Field
            label="Address"
            value={
              [saved.business_address_line1, saved.business_address_line2, saved.business_city, saved.business_state, saved.business_postal_code]
                .filter(Boolean)
                .join(", ") || ""
            }
          />
          <Field label="Time zone" value={saved.default_timezone} />
          <div className="rounded-xl bg-paper p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">EIN</div>
            <div className="mt-1 flex items-center gap-2 font-semibold text-ink">
              {saved.business_ein ? (
                <>
                  {showEin ? saved.business_ein : maskedEin || "Not added"}
                  <button onClick={() => setShowEin((v) => !v)} className="text-muted hover:text-ink" aria-label={showEin ? "Hide EIN" : "Show EIN"}>
                    {showEin ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </>
              ) : (
                "Not added"
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <EditField label="Legal business name">
              <input className="settings-input" value={draft.business_legal_name} onChange={(e) => update("business_legal_name", e.target.value)} />
            </EditField>
            <EditField label="Display/business name">
              <input className="settings-input" value={draft.brand_name} onChange={(e) => update("brand_name", e.target.value)} />
            </EditField>
            <EditField label="Primary email" error={fieldErrors.business_email}>
              <input type="email" className="settings-input" value={draft.business_email} onChange={(e) => update("business_email", e.target.value)} />
            </EditField>
            <EditField label="Primary phone" error={fieldErrors.business_phone}>
              <input className="settings-input" value={draft.business_phone} onChange={(e) => update("business_phone", e.target.value)} />
            </EditField>
            <EditField label="Website" error={fieldErrors.business_website}>
              <input className="settings-input" placeholder="https://" value={draft.business_website} onChange={(e) => update("business_website", e.target.value)} />
            </EditField>
            <EditField label="Business type">
              <input className="settings-input" value={draft.business_type} onChange={(e) => update("business_type", e.target.value)} />
            </EditField>
            <EditField label="Primary service">
              <input className="settings-input" value={draft.primary_service_type} onChange={(e) => update("primary_service_type", e.target.value)} />
            </EditField>
            <EditField label="Time zone">
              <select className="settings-input" value={draft.default_timezone} onChange={(e) => update("default_timezone", e.target.value)}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </EditField>
            <EditField label="Address line 1">
              <input className="settings-input" value={draft.business_address_line1} onChange={(e) => update("business_address_line1", e.target.value)} />
            </EditField>
            <EditField label="Address line 2">
              <input className="settings-input" value={draft.business_address_line2} onChange={(e) => update("business_address_line2", e.target.value)} />
            </EditField>
            <EditField label="City">
              <input className="settings-input" value={draft.business_city} onChange={(e) => update("business_city", e.target.value)} />
            </EditField>
            <div className="grid grid-cols-2 gap-3">
              <EditField label="State" error={fieldErrors.business_state}>
                <input className="settings-input" maxLength={2} value={draft.business_state} onChange={(e) => update("business_state", e.target.value.toUpperCase())} />
              </EditField>
              <EditField label="ZIP code" error={fieldErrors.business_postal_code}>
                <input className="settings-input" value={draft.business_postal_code} onChange={(e) => update("business_postal_code", e.target.value)} />
              </EditField>
            </div>
            <EditField label="EIN (optional)" hint="Only visible to workspace members; masked by default.">
              <input className="settings-input" value={draft.business_ein} onChange={(e) => update("business_ein", e.target.value)} placeholder="XX-XXXXXXX" />
            </EditField>
          </div>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-60"
            >
              <X size={15} /> Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-[#108A64] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0d7555] disabled:opacity-60"
            >
              <Save size={16} /> {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </div>
      )}
      <style jsx>{`.settings-input{width:100%;border:1px solid var(--line);border-radius:.75rem;padding:.7rem .8rem;font-size:.875rem;background:#fff;outline:none}.settings-input:focus{border-color:#108a64;box-shadow:0 0 0 3px rgba(16,138,100,.12)}`}</style>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-paper p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 font-semibold text-ink">{value || "Not added"}</div>
    </div>
  );
}

function EditField({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">{label}</span>
      {hint && <span className="mb-1.5 block text-xs font-normal normal-case tracking-normal text-muted">{hint}</span>}
      {children}
      {error && <span className="mt-1 block text-xs text-brick">{error}</span>}
    </label>
  );
}
