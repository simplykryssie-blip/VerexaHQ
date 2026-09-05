"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { AddressInput } from "@/components/AddressInput";
import { MaskedSecretField } from "@/components/settings/MaskedSecretField";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { formatEin, formatEfin } from "@/lib/taxIds";
import { formatPhone } from "@/lib/phone";

type Props = {
  workspaceId: string;
  website: string | null;
  mailingAddress: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  einLast4: string | null;
  efinLast4: string | null;
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
  workspaceId,
  website,
  mailingAddress,
  businessPhone,
  businessEmail,
  isOwner,
  isAdmin,
  einLast4,
  efinLast4,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [bizWebsite, setBizWebsite] = useState(website ?? "");
  const [bizAddress, setBizAddress] = useState(mailingAddress ?? "");
  const [bizPhone, setBizPhone] = useState(businessPhone ?? "");
  const [bizEmail, setBizEmail] = useState(businessEmail ?? "");

  const [ein, setEin] = useState("");
  const [efin, setEfin] = useState("");
  const [clearEin, setClearEin] = useState(false);
  const [clearEfin, setClearEfin] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (isOwner) {
      const { error: workspaceError } = await supabase
        .from("workspaces")
        .update({ phone: bizPhone || null, primary_contact_email: bizEmail || null, website: bizWebsite || null, mailing_address: bizAddress || null })
        .eq("id", workspaceId);
      if (workspaceError) {
        setSaving(false);
        setError(workspaceError.message);
        return;
      }
      // Support phone/email are read straight off this workspace's own
      // branding row wherever a client sees them (e.g. public organizer
      // links) -- never cascaded from an ERO, so there's no whitelabeling
      // gate here.
      const { error: brandingError } = await supabase
        .from("branding")
        .upsert({ workspace_id: workspaceId, support_phone: bizPhone || null, support_email: bizEmail || null }, { onConflict: "workspace_id" });
      if (brandingError) {
        setSaving(false);
        setError(brandingError.message);
        return;
      }
    }

    if (isAdmin && (ein.trim() || clearEin || efin.trim() || clearEfin)) {
      const { error: taxError } = await supabase.rpc("set_firm_tax_profile", {
        p_workspace_id: workspaceId,
        p_ein: ein.trim() ? ein.trim() : undefined,
        p_efin: efin.trim() ? efin.trim() : undefined,
        p_clear_ein: clearEin,
        p_clear_efin: clearEfin,
      });
      if (taxError) {
        setSaving(false);
        setError(taxError.message);
        return;
      }
      setEin("");
      setEfin("");
      setClearEin(false);
      setClearEfin(false);
    }

    setSaving(false);
    toast.show("Saved", "success");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
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

          <p className="mt-4 text-sm text-slate">
            Manage your logo, colors, and business name in{" "}
            <Link href="/settings/brand-center" className="font-medium text-accent hover:underline">
              Branding
            </Link>
            .
          </p>
        </SettingsCard>
      )}

      {isAdmin && (
        <SettingsCard
          title="Tax identifiers"
          description="EIN and EFIN are encrypted at rest -- only the last 4 digits are ever shown by default, and revealing the full value is audit-logged."
        >
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="divide-y divide-border">
              <MaskedSecretField
                label="EIN"
                last4={einLast4}
                onReveal={() => supabase.rpc("reveal_firm_ein", { p_workspace_id: workspaceId })}
                newValue={ein}
                onNewValueChange={(v) => setEin(formatEin(v))}
                clear={clearEin}
                onClearChange={setClearEin}
              />
              <MaskedSecretField
                label="EFIN"
                last4={efinLast4}
                onReveal={() => supabase.rpc("reveal_firm_efin", { p_workspace_id: workspaceId })}
                newValue={efin}
                onNewValueChange={(v) => setEfin(formatEfin(v))}
                clear={clearEfin}
                onClearChange={setClearEfin}
              />
            </div>
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
