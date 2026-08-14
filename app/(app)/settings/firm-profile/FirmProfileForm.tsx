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
import { formatPtin } from "@/lib/taxIds";
import { formatPhone } from "@/lib/phone";

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
  eroName: string | null;
  isOwner: boolean;
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
  eroName,
  isOwner,
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
      const { error: ptinError } = await supabase.rpc("set_my_ptin", { p_ptin: clearPtin ? undefined : ptin.trim(), p_clear: clearPtin });
      if (ptinError) {
        setSaving(false);
        setError(ptinError.message);
        return;
      }
      setPtin("");
      setClearPtin(false);
    }

    setSaving(false);
    toast.show("Saved", "success");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-8">
      {pendingAvatarFile && (
        <AvatarCropModal file={pendingAvatarFile} onCancel={() => setPendingAvatarFile(null)} onCropped={applyCroppedAvatar} />
      )}

      <div>
        <h3 className="text-sm font-semibold text-ink">You</h3>
        <p className="mt-0.5 text-xs text-muted">Personal to you -- not shared with the rest of your workspace.</p>

        <div className="mt-4 flex items-center gap-3">
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
          <div className="mt-3">
            <MaskedSecretField
              label="PTIN"
              last4={ptinLast4}
              onReveal={() => supabase.rpc("reveal_my_ptin")}
              newValue={ptin}
              onNewValueChange={(v) => setPtin(formatPtin(v))}
              clear={clearPtin}
              onClearChange={setClearPtin}
              helpText="Your own PTIN -- encrypted, only you can reveal it."
            />
          </div>
        )}
      </div>

      {isOwner && (
      <div className="border-t border-border pt-8">
        <h3 className="text-sm font-semibold text-ink">Your business</h3>
        <p className="mt-0.5 text-xs text-muted">
          One phone number and email here, used everywhere clients see your firm -- the client portal, your public intake forms, and invite emails.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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

        {isWhitelabeledByEro ? (
          <p className="mt-4 rounded-lg border border-border bg-surfaceMuted p-3 text-sm text-slate">
            Your logo, colors, and business name are managed by {eroName ?? "your ERO"} -- your staff dashboard and your clients&apos; portal both show
            their branding. If something looks wrong, contact them to have it updated.
          </p>
        ) : (
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

            <div className="mt-4">
              <LabeledInput label="Business name" value={bizName} onChange={(e) => setBizName(e.target.value)} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-sm font-medium text-slate">Nav bar color</span>
                <div className="mt-1 flex items-center gap-2">
                  <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-9 w-14 rounded border border-border" />
                  <span className="font-mono text-xs text-muted">{primary}</span>
                </div>
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-slate">Accent color</span>
                <div className="mt-1 flex items-center gap-2">
                  <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-9 w-14 rounded border border-border" />
                  <span className="font-mono text-xs text-muted">{secondary}</span>
                </div>
              </label>
            </div>
          </>
        )}
      </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="border-t border-border pt-4">
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
