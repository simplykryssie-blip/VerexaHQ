"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MaskedSecretField } from "@/components/settings/MaskedSecretField";

type Profile = {
  ein_last4: string | null;
  efin_last4: string | null;
  ptin_last4: string | null;
  supported_filing_states: string[];
} | null;

export function FirmTaxProfileForm({
  workspaceId,
  profile,
  showEin,
  showEfin,
  showPtin,
}: {
  workspaceId: string;
  profile: Profile;
  showEin: boolean;
  showEfin: boolean;
  showPtin: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [ein, setEin] = useState("");
  const [efin, setEfin] = useState("");
  const [ptin, setPtin] = useState("");
  const [clearEin, setClearEin] = useState(false);
  const [clearEfin, setClearEfin] = useState(false);
  const [clearPtin, setClearPtin] = useState(false);
  const [states, setStates] = useState((profile?.supported_filing_states ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const parsedStates = states
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const { error } = await supabase.rpc("set_firm_tax_profile", {
      p_workspace_id: workspaceId,
      p_ein: showEin && ein.trim() ? ein.trim() : undefined,
      p_efin: showEfin && efin.trim() ? efin.trim() : undefined,
      p_ptin: showPtin && ptin.trim() ? ptin.trim() : undefined,
      p_clear_ein: clearEin,
      p_clear_efin: clearEfin,
      p_clear_ptin: clearPtin,
      p_supported_filing_states: parsedStates,
    });

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEin("");
    setEfin("");
    setPtin("");
    setClearEin(false);
    setClearEfin(false);
    setClearPtin(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {showEin && (
        <MaskedSecretField
          label="EIN"
          last4={profile?.ein_last4 ?? null}
          onReveal={() => supabase.rpc("reveal_firm_ein", { p_workspace_id: workspaceId })}
          newValue={ein}
          onNewValueChange={setEin}
          clear={clearEin}
          onClearChange={setClearEin}
        />
      )}
      {showEfin && (
        <MaskedSecretField
          label="EFIN"
          last4={profile?.efin_last4 ?? null}
          onReveal={() => supabase.rpc("reveal_firm_efin", { p_workspace_id: workspaceId })}
          newValue={efin}
          onNewValueChange={setEfin}
          clear={clearEfin}
          onClearChange={setClearEfin}
        />
      )}
      {showPtin && (
        <MaskedSecretField
          label="PTIN"
          last4={profile?.ptin_last4 ?? null}
          onReveal={() => supabase.rpc("reveal_firm_ptin", { p_workspace_id: workspaceId })}
          newValue={ptin}
          onNewValueChange={setPtin}
          clear={clearPtin}
          onClearChange={setClearPtin}
        />
      )}

      <div>
        <label className="block text-sm font-medium text-slate">Supported filing states</label>
        <input
          value={states}
          onChange={(e) => setStates(e.target.value)}
          placeholder="e.g. CA, NY, TX"
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <p className="mt-1 text-xs text-muted">Comma-separated state abbreviations.</p>
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
