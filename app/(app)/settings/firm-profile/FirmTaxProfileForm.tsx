"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MaskedSecretField } from "@/components/settings/MaskedSecretField";
import { formatEin, formatEfin, formatPtin } from "@/lib/taxIds";
import { US_STATES, SPECIAL_CERTIFICATION_STATE_CODES } from "@/lib/usStates";

type Profile = {
  ein_last4: string | null;
  efin_last4: string | null;
  ptin_last4: string | null;
  supported_filing_states: string[];
} | null;

function defaultStates(profile: Profile): Set<string> {
  if (profile?.supported_filing_states && profile.supported_filing_states.length > 0) {
    return new Set(profile.supported_filing_states);
  }
  return new Set(US_STATES.map((s) => s.code).filter((c) => !SPECIAL_CERTIFICATION_STATE_CODES.has(c)));
}

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
  const [states, setStates] = useState<Set<string>>(() => defaultStates(profile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const parsedStates = Array.from(states);

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
          onNewValueChange={(v) => setEin(formatEin(v))}
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
          onNewValueChange={(v) => setEfin(formatEfin(v))}
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
          onNewValueChange={(v) => setPtin(formatPtin(v))}
          clear={clearPtin}
          onClearChange={setClearPtin}
        />
      )}

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-slate">Supported filing states</label>
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
          States requiring their own preparer license (
          {Array.from(SPECIAL_CERTIFICATION_STATE_CODES).join(", ")}) start unchecked -- adjust as needed.
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
