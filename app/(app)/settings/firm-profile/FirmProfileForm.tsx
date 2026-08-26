"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Avatar } from "@/components/Avatar";
import { AddressInput } from "@/components/AddressInput";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { MaskedSecretField } from "@/components/settings/MaskedSecretField";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { formatEin, formatEfin, formatPtin } from "@/lib/taxIds";
import { formatPhone } from "@/lib/phone";
import { US_STATES, SPECIAL_CERTIFICATION_STATE_CODES } from "@/lib/usStates";
import { WEEKDAYS, type BusinessHours, type DayHours } from "@/lib/businessHours";

const DAY_LABELS: Record<string, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};
const SLOT_OPTIONS = [15, 30, 45, 60];

type Props = {
  userId: string;
  workspaceId: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  personalPhone: string | null;
  showPtin: boolean;
  ptinLast4: string | null;
  businessName: string | null;
  website: string | null;
  mailingAddress: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  isWhitelabeledByEro: boolean;
  allowsBrandingOverride: boolean;
  eroName: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  canManageSettings: boolean;
  showEin: boolean;
  showEfin: boolean;
  showFirmPtin: boolean;
  einLast4: string | null;
  efinLast4: string | null;
  firmPtinLast4: string | null;
  supportedFilingStates: string[];
  initialHours: BusinessHours;
  initialSlotMinutes: number;
};

function LabeledInput({
  label,
  helpText,
  ...inputProps
}: { label: string; helpText?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate">{label}</span>
      <input
        {...inputProps}
        className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {helpText && <span className="mt-1 block text-xs text-muted">{helpText}</span>}
    </label>
  );
}

function defaultStates(supported: string[]): Set<string> {
  if (supported.length > 0) return new Set(supported);
  return new Set(US_STATES.map((s) => s.code).filter((c) => !SPECIAL_CERTIFICATION_STATE_CODES.has(c)));
}

export function FirmProfileForm({
  userId,
  workspaceId,
  firstName,
  lastName,
  displayName,
  avatarUrl,
  personalPhone,
  showPtin,
  ptinLast4,
  businessName,
  website,
  mailingAddress,
  businessPhone,
  businessEmail,
  logoUrl,
  primaryColor,
  secondaryColor,
  isWhitelabeledByEro,
  allowsBrandingOverride,
  eroName,
  isOwner,
  isAdmin,
  canManageSettings,
  showEin,
  showEfin,
  showFirmPtin,
  einLast4,
  efinLast4,
  firmPtinLast4,
  supportedFilingStates,
  initialHours,
  initialSlotMinutes,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [first, setFirst] = useState(firstName ?? "");
  const [last, setLast] = useState(lastName ?? "");
  const [display, setDisplay] = useState(displayName ?? "");
  const [avatar, setAvatar] = useState(avatarUrl);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pPhone, setPPhone] = useState(personalPhone ?? "");
  const [ptin, setPtin] = useState("");
  const [clearPtin, setClearPtin] = useState(false);

  const [bizName, setBizName] = useState(businessName ?? "");
  const [bizWebsite, setBizWebsite] = useState(website ?? "");
  const [bizAddress, setBizAddress] = useState(mailingAddress ?? "");
  const [bizPhone, setBizPhone] = useState(businessPhone ?? "");
  const [bizEmail, setBizEmail] = useState(businessEmail ?? "");
  const [logo, setLogo] = useState(logoUrl);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [primary, setPrimary] = useState(primaryColor);
  const [secondary, setSecondary] = useState(secondaryColor);

  const [ein, setEin] = useState("");
  const [efin, setEfin] = useState("");
  const [firmPtin, setFirmPtin] = useState("");
  const [clearEin, setClearEin] = useState(false);
  const [clearEfin, setClearEfin] = useState(false);
  const [clearFirmPtin, setClearFirmPtin] = useState(false);
  const [states, setStates] = useState<Set<string>>(() => defaultStates(supportedFilingStates));

  const [hours, setHours] = useState<BusinessHours>(initialHours);
  const [slotMinutes, setSlotMinutes] = useState(initialSlotMinutes);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateDay(day: keyof BusinessHours, patch: Partial<NonNullable<DayHours>> | null) {
    setHours((prev) => ({
      ...prev,
      [day]: patch === null ? null : { ...(prev[day] ?? { start: "09:00", end: "17:00" }), ...patch },
    }));
  }

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

  async function applyCroppedAvatar(blob: Blob) {
    setUploadingAvatar(true);
    setPendingAvatarFile(null);
    const path = `${userId}/avatar-${Date.now()}.jpg`;
    const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    setUploadingAvatar(false);
    if (uploadErr) {
      toast.show(uploadErr.message, "error");
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatar(data.publicUrl);
  }

  async function removeAvatar() {
    setAvatar(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const writes: PromiseLike<{ error: { message: string } | null }>[] = [
      supabase
        .from("user_profiles")
        .update({ first_name: first || null, last_name: last || null, display_name: display || null, phone: pPhone || null, avatar_url: avatar })
        .eq("id", userId),
    ];
    if (canManageSettings) {
      writes.push(
        supabase
          .from("system_settings")
          .upsert({ workspace_id: workspaceId, key: "business_hours", value: hours }, { onConflict: "workspace_id,key" }),
        supabase
          .from("system_settings")
          .upsert({ workspace_id: workspaceId, key: "booking_slot_minutes", value: slotMinutes }, { onConflict: "workspace_id,key" })
      );
    }
    if (isOwner) {
      writes.push(
        supabase
          .from("workspaces")
          .update({ phone: bizPhone || null, primary_contact_email: bizEmail || null, website: bizWebsite || null, mailing_address: bizAddress || null })
          .eq("id", workspaceId)
      );
      if (!isWhitelabeledByEro) {
        writes.push(
          supabase.from("branding").upsert(
            {
              workspace_id: workspaceId,
              display_name: bizName || null,
              support_phone: bizPhone || null,
              support_email: bizEmail || null,
              sidebar_logo_url: logo,
              primary_color: primary,
              secondary_color: secondary,
            },
            { onConflict: "workspace_id" }
          )
        );
      } else if (allowsBrandingOverride) {
        // Logo/color only -- business name, support contact, etc. stay
        // whatever the ERO has set, this just layers a look on top.
        writes.push(
          supabase.from("branding").upsert(
            { workspace_id: workspaceId, sidebar_logo_url: logo, primary_color: primary, secondary_color: secondary },
            { onConflict: "workspace_id" }
          )
        );
      }
    }
    const results = await Promise.all(writes);

    for (const result of results) {
      if (result.error) {
        setSaving(false);
        setError(result.error.message);
        return;
      }
    }

    if (showPtin && (ptin.trim() || clearPtin)) {
      const { error: ptinError } = await supabase.rpc("set_my_ptin", {
        p_ptin: (clearPtin ? null : ptin.trim()) as string,
        p_clear: clearPtin,
      });
      if (ptinError) {
        setSaving(false);
        setError(ptinError.message);
        return;
      }
      setPtin("");
      setClearPtin(false);
    }

    if (isAdmin) {
      const { error: taxError } = await supabase.rpc("set_firm_tax_profile", {
        p_workspace_id: workspaceId,
        p_ein: showEin && ein.trim() ? ein.trim() : undefined,
        p_efin: showEfin && efin.trim() ? efin.trim() : undefined,
        p_ptin: showFirmPtin && firmPtin.trim() ? firmPtin.trim() : undefined,
        p_clear_ein: clearEin,
        p_clear_efin: clearEfin,
        p_clear_ptin: clearFirmPtin,
        p_supported_filing_states: Array.from(states),
      });
      if (taxError) {
        setSaving(false);
        setError(taxError.message);
        return;
      }
      setEin("");
      setEfin("");
      setFirmPtin("");
      setClearEin(false);
      setClearEfin(false);
      setClearFirmPtin(false);
    }

    setSaving(false);
    toast.show("Saved", "success");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {pendingAvatarFile && (
        <AvatarCropModal file={pendingAvatarFile} onCancel={() => setPendingAvatarFile(null)} onCropped={applyCroppedAvatar} />
      )}

      <SettingsCard title="You" description="Personal to you -- not shared with the rest of your workspace.">
        <div className="flex items-center gap-3">
          <Avatar name={display || `${first} ${last}`.trim()} url={avatar} size="lg" />
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent">
              <UploadCloud size={13} />
              {uploadingAvatar ? "Uploading..." : avatar ? "Replace photo" : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                disabled={uploadingAvatar}
                onChange={(e) => e.target.files?.[0] && setPendingAvatarFile(e.target.files[0])}
                className="sr-only"
              />
            </label>
            {avatar && (
              <button type="button" onClick={removeAvatar} className="text-xs font-medium text-muted hover:text-danger">
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledInput label="First name" value={first} onChange={(e) => setFirst(e.target.value)} />
          <LabeledInput label="Last name" value={last} onChange={(e) => setLast(e.target.value)} />
        </div>
        <div className="mt-3">
          <LabeledInput label="Display name" value={display} onChange={(e) => setDisplay(e.target.value)} />
        </div>
        <div className="mt-3">
          <LabeledInput
            label="Your direct phone"
            type="tel"
            value={pPhone}
            onChange={(e) => setPPhone(formatPhone(e.target.value))}
            helpText="Only if it's different from the business phone below -- shown to clients you're the direct point of contact for."
          />
        </div>

        {showPtin && (
          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <MaskedSecretField
              label="PTIN"
              last4={ptinLast4}
              onReveal={() => supabase.rpc("reveal_my_ptin")}
              newValue={ptin}
              onNewValueChange={(v) => setPtin(formatPtin(v))}
              clear={clearPtin}
              onClearChange={setClearPtin}
              helpText="Encrypted -- only you can reveal it."
            />
          </div>
        )}
      </SettingsCard>

      {isOwner && (
        <SettingsCard
          title="Your business"
          description="One phone number and email here, used everywhere clients see your firm -- the client portal, your public intake forms, and invite emails."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledInput label="Business phone" type="tel" value={bizPhone} onChange={(e) => setBizPhone(formatPhone(e.target.value))} />
            <LabeledInput
              label="Business email"
              type="email"
              value={bizEmail}
              onChange={(e) => setBizEmail(e.target.value)}
              onBlur={(e) => setBizEmail(e.target.value.trim().toLowerCase())}
            />
          </div>
          <div className="mt-3">
            <LabeledInput label="Website" value={bizWebsite} onChange={(e) => setBizWebsite(e.target.value)} placeholder="https://" />
          </div>
          <div className="mt-3">
            <span className="block text-sm font-medium text-slate">Mailing address</span>
            <div className="mt-1">
              <AddressInput value={bizAddress} onChange={setBizAddress} />
            </div>
          </div>

          {isWhitelabeledByEro && !allowsBrandingOverride && (
            <p className="mt-4 rounded-lg border border-border bg-surfaceMuted p-3 text-sm text-slate">
              Your logo, colors, and business name are managed by {eroName ?? "your ERO"} -- your staff dashboard and your clients&apos; portal both show
              their branding. If something looks wrong, contact them to have it updated.
            </p>
          )}

          {isWhitelabeledByEro && allowsBrandingOverride && (
            <p className="mt-4 rounded-lg border border-border bg-surfaceMuted p-3 text-sm text-slate">
              {eroName ?? "Your ERO"} has let you set your own logo and accent color below -- your business name and support contact still come from
              them.
            </p>
          )}

          {(!isWhitelabeledByEro || allowsBrandingOverride) && (
            <>
              <div className="mt-4 flex items-center gap-3">
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
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingLogo}
                      onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
                      className="sr-only"
                    />
                  </label>
                  {logo && (
                    <button type="button" onClick={() => setLogo(null)} className="text-xs font-medium text-muted hover:text-danger" aria-label="Remove logo">
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              {!isWhitelabeledByEro && (
                <div className="mt-4">
                  <LabeledInput label="Business name" value={bizName} onChange={(e) => setBizName(e.target.value)} />
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-4">
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
            </>
          )}
        </SettingsCard>
      )}

      {isAdmin && (showEin || showEfin || showFirmPtin) && (
        <SettingsCard
          title="Tax identifiers"
          description="EIN, EFIN, and PTIN are encrypted at rest -- only the last 4 digits are ever shown by default, and revealing the full value is audit-logged."
        >
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="divide-y divide-border">
              {showEin && (
                <MaskedSecretField
                  label="EIN"
                  last4={einLast4}
                  onReveal={() => supabase.rpc("reveal_firm_ein", { p_workspace_id: workspaceId })}
                  newValue={ein}
                  onNewValueChange={(v) => setEin(formatEin(v))}
                  clear={clearEin}
                  onClearChange={setClearEin}
                />
              )}
              {showEfin && (
                <MaskedSecretField
                  label="EFIN"
                  last4={efinLast4}
                  onReveal={() => supabase.rpc("reveal_firm_efin", { p_workspace_id: workspaceId })}
                  newValue={efin}
                  onNewValueChange={(v) => setEfin(formatEfin(v))}
                  clear={clearEfin}
                  onClearChange={setClearEfin}
                />
              )}
              {showFirmPtin && (
                <MaskedSecretField
                  label="PTIN"
                  last4={firmPtinLast4}
                  onReveal={() => supabase.rpc("reveal_firm_ptin", { p_workspace_id: workspaceId })}
                  newValue={firmPtin}
                  onNewValueChange={(v) => setFirmPtin(formatPtin(v))}
                  clear={clearFirmPtin}
                  onClearChange={setClearFirmPtin}
                />
              )}
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="block text-sm font-medium text-slate">Supported filing states</span>
              <div className="flex items-center gap-2 text-xs">
                <button type="button" onClick={() => setStates(new Set(US_STATES.map((s) => s.code)))} className="font-medium text-accent hover:underline">
                  Select all
                </button>
                <span className="text-muted">·</span>
                <button type="button" onClick={() => setStates(new Set())} className="font-medium text-accent hover:underline">
                  Clear all
                </button>
              </div>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              States requiring their own preparer license ({Array.from(SPECIAL_CERTIFICATION_STATE_CODES).join(", ")}) start unchecked -- adjust as needed.
            </p>
            <div className="mt-2 grid max-h-64 grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-3">
              {US_STATES.map((s) => (
                <label key={s.code} className="flex items-center gap-1.5 text-xs text-slate">
                  <input
                    type="checkbox"
                    checked={states.has(s.code)}
                    onChange={(e) => {
                      const next = new Set(states);
                      if (e.target.checked) next.add(s.code);
                      else next.delete(s.code);
                      setStates(next);
                    }}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  {s.name}
                  {SPECIAL_CERTIFICATION_STATE_CODES.has(s.code) && <span className="text-muted">*</span>}
                </label>
              ))}
            </div>
          </div>
        </SettingsCard>
      )}

      {canManageSettings && (
      <SettingsCard
        title="Booking availability"
        description="When clients can self-book a bookable service from their portal. Slot length sets the scheduling grid; each service's own duration determines how much time a booking actually reserves."
      >
        <div className="space-y-2">
          {WEEKDAYS.map((day) => {
            const open = hours[day];
            return (
              <div key={day} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
                <label className="flex w-32 items-center gap-2 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={Boolean(open)}
                    onChange={(e) => updateDay(day, e.target.checked ? {} : null)}
                    className="h-4 w-4 rounded border-border"
                  />
                  {DAY_LABELS[day]}
                </label>
                {open ? (
                  <div className="flex items-center gap-2 text-sm text-slate">
                    <input
                      type="time"
                      value={open.start}
                      onChange={(e) => updateDay(day, { start: e.target.value })}
                      className="rounded-lg border border-border px-2 py-1 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <span className="text-muted">to</span>
                    <input
                      type="time"
                      value={open.end}
                      onChange={(e) => updateDay(day, { end: e.target.value })}
                      className="rounded-lg border border-border px-2 py-1 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted">Closed</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <label className="text-sm font-medium text-ink" htmlFor="slot-minutes">
            Slot length
          </label>
          <select
            id="slot-minutes"
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(Number(e.target.value))}
            className="rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {SLOT_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </div>
      </SettingsCard>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
