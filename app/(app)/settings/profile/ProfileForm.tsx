"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Avatar } from "@/components/Avatar";
import { AddressInput } from "@/components/AddressInput";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { MaskedSecretField } from "@/components/settings/MaskedSecretField";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { formatEin, formatPtin } from "@/lib/taxIds";
import { formatPhone } from "@/lib/phone";

type Props = {
  userId: string;
  workspaceId: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  personalPhone: string | null;
  // "personal": an ERO/service-bureau staff member's own PTIN, stored on
  // user_profiles. "firm": a solo PTIN-tier workspace's PTIN, stored on
  // firm_tax_profile -- the workspace IS the preparer, so there's no
  // separate personal-vs-firm distinction to make for them.
  ptinSource: "personal" | "firm";
  ptinLast4: string | null;
  showBusinessInfo: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  einLast4: string | null;
  website: string | null;
  mailingAddress: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
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

export function ProfileForm({
  userId,
  workspaceId,
  firstName,
  lastName,
  displayName,
  avatarUrl,
  personalPhone,
  ptinSource,
  ptinLast4,
  showBusinessInfo,
  isOwner,
  isAdmin,
  einLast4,
  website,
  mailingAddress,
  businessPhone,
  businessEmail,
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

  const [bizWebsite, setBizWebsite] = useState(website ?? "");
  const [bizAddress, setBizAddress] = useState(mailingAddress ?? "");
  const [bizPhone, setBizPhone] = useState(businessPhone ?? "");
  const [bizEmail, setBizEmail] = useState(businessEmail ?? "");
  const [ein, setEin] = useState("");
  const [clearEin, setClearEin] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    const { error: profileError } = await supabase
      .from("user_profiles")
      .update({ first_name: first || null, last_name: last || null, display_name: display || null, phone: pPhone || null, avatar_url: avatar })
      .eq("id", userId);
    if (profileError) {
      setSaving(false);
      setError(profileError.message);
      return;
    }

    if (showBusinessInfo && isOwner) {
      const { error: workspaceError } = await supabase
        .from("workspaces")
        .update({ phone: bizPhone || null, primary_contact_email: bizEmail || null, website: bizWebsite || null, mailing_address: bizAddress || null })
        .eq("id", workspaceId);
      if (workspaceError) {
        setSaving(false);
        setError(workspaceError.message);
        return;
      }
      const { error: brandingError } = await supabase
        .from("branding")
        .upsert({ workspace_id: workspaceId, support_phone: bizPhone || null, support_email: bizEmail || null }, { onConflict: "workspace_id" });
      if (brandingError) {
        setSaving(false);
        setError(brandingError.message);
        return;
      }
    }

    if (ptinSource === "personal" && (ptin.trim() || clearPtin)) {
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

    if (ptinSource === "firm" || (showBusinessInfo && isAdmin)) {
      const wantsPtinWrite = ptinSource === "firm" && (ptin.trim() || clearPtin);
      const wantsEinWrite = showBusinessInfo && isAdmin && (ein.trim() || clearEin);
      if (wantsPtinWrite || wantsEinWrite) {
        const { error: taxError } = await supabase.rpc("set_firm_tax_profile", {
          p_workspace_id: workspaceId,
          p_ein: wantsEinWrite && ein.trim() ? ein.trim() : undefined,
          p_ptin: wantsPtinWrite && ptin.trim() ? ptin.trim() : undefined,
          p_clear_ein: clearEin,
          p_clear_ptin: ptinSource === "firm" ? clearPtin : false,
        });
        if (taxError) {
          setSaving(false);
          setError(taxError.message);
          return;
        }
        setPtin("");
        setClearPtin(false);
        setEin("");
        setClearEin(false);
      }
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
            helpText="Only if it's different from the business phone -- shown to clients you're the direct point of contact for."
          />
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          <MaskedSecretField
            label="PTIN"
            last4={ptinLast4}
            onReveal={() => (ptinSource === "personal" ? supabase.rpc("reveal_my_ptin") : supabase.rpc("reveal_firm_ptin", { p_workspace_id: workspaceId }))}
            newValue={ptin}
            onNewValueChange={(v) => setPtin(formatPtin(v))}
            clear={clearPtin}
            onClearChange={setClearPtin}
            helpText="Encrypted -- only you can reveal it."
          />
        </div>
      </SettingsCard>

      {showBusinessInfo && isOwner && (
        <SettingsCard
          title="Your business"
          description="One phone number and email here, used everywhere clients see your practice -- the client portal, your public intake forms, and invite emails."
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

          <p className="mt-4 text-sm text-slate">
            Manage your logo, colors, and business name in{" "}
            <Link href="/settings/brand-center" className="font-medium text-accent hover:underline">
              Branding
            </Link>
            .
          </p>
        </SettingsCard>
      )}

      {showBusinessInfo && isAdmin && (
        <SettingsCard
          title="Tax identifier"
          description="Your EIN is encrypted at rest -- only the last 4 digits are ever shown by default, and revealing the full value is audit-logged."
        >
          <div className="overflow-hidden rounded-xl border border-border">
            <MaskedSecretField
              label="EIN"
              last4={einLast4}
              onReveal={() => supabase.rpc("reveal_firm_ein", { p_workspace_id: workspaceId })}
              newValue={ein}
              onNewValueChange={(v) => setEin(formatEin(v))}
              clear={clearEin}
              onClearChange={setClearEin}
            />
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
