"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  ein_last4: string | null;
  efin_last4: string | null;
  ptin_last4: string | null;
  supported_filing_states: string[];
} | null;

// Mirrors clients/[id]/TaxIdReveal.tsx's reveal/hide UX -- the masked value
// (last 4 only) is all that's ever sent to the browser on page load; the
// real value is fetched on demand via a permission-gated, audit-logged RPC.
function MaskedField({
  label,
  last4,
  revealRpc,
  workspaceId,
  newValue,
  onNewValueChange,
  clear,
  onClearChange,
}: {
  label: string;
  last4: string | null;
  revealRpc: "reveal_firm_ein" | "reveal_firm_efin" | "reveal_firm_ptin";
  workspaceId: string;
  newValue: string;
  onNewValueChange: (v: string) => void;
  clear: boolean;
  onClearChange: (v: boolean) => void;
}) {
  const supabase = createClient();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  async function reveal() {
    setRevealing(true);
    setRevealError(null);
    const { data, error } = await supabase.rpc(revealRpc, { p_workspace_id: workspaceId });
    setRevealing(false);
    if (error) {
      setRevealError(error.message);
      return;
    }
    setRevealed(data as string);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate">{label}</label>
        {last4 && !clear && (
          <span className="inline-flex items-center gap-2 text-xs">
            <span className="font-mono text-muted">{revealed ?? `••••${last4}`}</span>
            <button
              type="button"
              disabled={revealing}
              onClick={() => (revealed ? setRevealed(null) : reveal())}
              className="font-medium text-accent hover:underline disabled:opacity-60"
            >
              {revealing ? "Revealing..." : revealed ? "Hide" : "Reveal"}
            </button>
          </span>
        )}
      </div>
      {revealError && <p className="mt-0.5 text-xs text-danger">{revealError}</p>}
      <input
        value={newValue}
        onChange={(e) => onNewValueChange(e.target.value)}
        disabled={clear}
        placeholder={last4 ? `Currently ending in ${last4} -- enter a new value to replace it` : "Not set"}
        className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted disabled:opacity-60"
      />
      {last4 && (
        <label className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={clear}
            onChange={(e) => {
              onClearChange(e.target.checked);
              if (e.target.checked) onNewValueChange("");
            }}
            className="h-3.5 w-3.5 rounded border-border"
          />
          Remove this value
        </label>
      )}
    </div>
  );
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
        <MaskedField
          label="EIN"
          last4={profile?.ein_last4 ?? null}
          revealRpc="reveal_firm_ein"
          workspaceId={workspaceId}
          newValue={ein}
          onNewValueChange={setEin}
          clear={clearEin}
          onClearChange={setClearEin}
        />
      )}
      {showEfin && (
        <MaskedField
          label="EFIN"
          last4={profile?.efin_last4 ?? null}
          revealRpc="reveal_firm_efin"
          workspaceId={workspaceId}
          newValue={efin}
          onNewValueChange={setEfin}
          clear={clearEfin}
          onClearChange={setClearEfin}
        />
      )}
      {showPtin && (
        <MaskedField
          label="PTIN"
          last4={profile?.ptin_last4 ?? null}
          revealRpc="reveal_firm_ptin"
          workspaceId={workspaceId}
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
