"use client";

// Secure identity information (SSN / ITIN / ATIN / IP PIN) capture for one
// person on the intake. Deliberately self-contained and never wired into
// the wizard's `answers` state object: the plain value never enters that
// broadly-readable jsonb draft, never round-trips through save_intake_progress,
// and is never logged. Every read/write goes straight to the token-scoped
// intake_identity_vault RPCs (see supabase/migrations/20260730100000_*),
// which store only an encrypted payload plus a masked_value/last_four pair
// -- the plain value is discarded by this component immediately after the
// save call resolves and is never held in state afterward.
import { useCallback, useEffect, useState } from "react";
import { supabaseIntake } from "@/lib/supabaseIntake";
import { publicIntakeErrorMessage } from "@/lib/publicIntakeError";
import { reportIntakeError } from "@/lib/reportIntakeError";

type PersonType = "taxpayer" | "spouse" | "dependent" | "childcare_provider" | "business" | "owner";
type TaxIdType = "ssn" | "itin" | "atin" | "ein";
type IdentityStatus = "" | "provided" | "will_provide_later" | "need_help";
type FieldKind = "tax_id" | "ip_pin" | "provider_tax_id" | "business_ein" | "owner_tax_id";

type IdentityStatusRow = {
  person_type: PersonType;
  person_ref: string | null;
  identity_type: string;
  status: IdentityStatus;
  masked_value: string | null;
  last_four: string | null;
};

function labelForStatus(status: IdentityStatus, kind: FieldKind, maskedValue: string | null) {
  if (status === "provided") return maskedValue ? `On file, ending in ${maskedValue.slice(-4)}` : "On file";
  if (status === "will_provide_later") return kind === "ip_pin" ? "Will retrieve from IRS Online Account" : kind === "provider_tax_id" ? "I don't have the tax ID yet" : "Will provide securely later";
  if (status === "need_help") return kind === "provider_tax_id" ? "I need help obtaining this information" : "Help requested";
  return "Not entered yet";
}

export function SecureIdentityField({
  token,
  personType,
  personRef,
  personLabel,
  kind,
  required,
}: {
  token: string;
  personType: PersonType;
  personRef: string | null;
  personLabel: string;
  kind: FieldKind;
  required?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [taxIdType, setTaxIdType] = useState<TaxIdType>(kind === "business_ein" ? "ein" : "ssn");
  const [status, setStatus] = useState<IdentityStatus>("");
  const [maskedValue, setMaskedValue] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const identityType = kind === "ip_pin" ? "ip_pin" : kind === "business_ein" ? "ein" : taxIdType;

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabaseIntake.rpc("public_intake_identity_status", { p_token: token });
    setLoading(false);
    if (err) {
      reportIntakeError("public_intake_identity_status", err);
      return;
    }
    const rows = (data as IdentityStatusRow[] | null) || [];
    const match = rows.find(
      (r) =>
        r.person_type === personType &&
        (r.person_ref ?? null) === personRef &&
        (kind === "ip_pin"
          ? r.identity_type === "ip_pin"
          : kind === "business_ein"
            ? r.identity_type === "ein"
            : kind === "provider_tax_id" || kind === "owner_tax_id"
              ? r.identity_type === "ssn" || r.identity_type === "ein" || r.identity_type === "itin"
              : r.identity_type === "ssn" || r.identity_type === "itin" || r.identity_type === "atin")
    );
    if (match) {
      if (match.identity_type !== "ip_pin") setTaxIdType(match.identity_type as TaxIdType);
      setStatus(match.status);
      setMaskedValue(match.masked_value);
    }
  }, [token, personType, personRef, kind]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(nextStatus: Exclude<IdentityStatus, "">) {
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabaseIntake.rpc("public_save_intake_identity", {
      p_token: token,
      p_person_type: personType,
      p_identity_type: identityType,
      p_status: nextStatus,
      p_person_ref: personRef,
      p_plain_value: nextStatus === "provided" ? inputValue : null,
      p_note: note.trim() || null,
    });
    setSaving(false);
    // Clear the plaintext out of local state immediately regardless of
    // outcome -- it must never linger in memory longer than the call.
    setInputValue("");
    if (err || !data) {
      reportIntakeError("public_save_intake_identity", err);
      setError(publicIntakeErrorMessage(err, "We couldn't save this securely. Please try again."));
      return;
    }
    const row = data as { status: IdentityStatus; masked_value: string | null };
    setStatus(row.status);
    setMaskedValue(row.masked_value);
    setEditing(false);
  }

  const idLabel = kind === "ip_pin" ? "IP PIN" : kind === "business_ein" ? "EIN" : taxIdType.toUpperCase();
  const taxIdChoices: TaxIdType[] =
    kind === "provider_tax_id" || kind === "owner_tax_id"
      ? ["ssn", "itin", "ein"]
      : ["ssn", "itin", ...(personType === "dependent" ? (["atin"] as TaxIdType[]) : [])];

  return (
    <div className="border border-line rounded-sm p-3 bg-paperDim">
      <div className="text-xs font-semibold text-muted mb-1">
        {personLabel} {kind === "ip_pin" ? "Identity Protection PIN" : "Tax ID"}
        {required && <span className="text-brick"> *</span>}
      </div>

      {loading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : !editing ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink">{labelForStatus(status, kind, maskedValue)}</span>
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-blue underline shrink-0">
            {status ? "Update" : "Enter"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {kind !== "ip_pin" && kind !== "business_ein" && (
            <div className="flex gap-3 text-xs">
              {taxIdChoices.map((t) => (
                <label key={t} className="flex items-center gap-1">
                  <input type="radio" name={`idtype-${personType}-${personRef}`} checked={taxIdType === t} onChange={() => setTaxIdType(t)} />
                  {t.toUpperCase()}
                </label>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder={kind === "ip_pin" ? "6-digit IP PIN" : `${idLabel} (digits only)`}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="border border-line rounded-sm px-3 py-2 text-sm bg-white"
            />
            <button
              type="button"
              disabled={saving || inputValue.trim().length < 4}
              onClick={() => save("provided")}
              className="text-sm font-semibold bg-ink text-white px-3 py-2 rounded-sm disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save securely"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {kind === "ip_pin" ? (
              <>
                <button type="button" disabled={saving} onClick={() => save("will_provide_later")} className="text-xs font-semibold text-ink border border-line rounded-sm px-2 py-1">
                  I&apos;ll retrieve it from my IRS Online Account
                </button>
                <button type="button" disabled={saving} onClick={() => save("need_help")} className="text-xs font-semibold text-ink border border-line rounded-sm px-2 py-1">
                  I need help understanding how to retrieve it
                </button>
              </>
            ) : kind === "provider_tax_id" ? (
              <>
                <button type="button" disabled={saving} onClick={() => save("will_provide_later")} className="text-xs font-semibold text-ink border border-line rounded-sm px-2 py-1">
                  I do not have the tax ID yet
                </button>
                <button type="button" disabled={saving} onClick={() => save("need_help")} className="text-xs font-semibold text-ink border border-line rounded-sm px-2 py-1">
                  I need help obtaining this information
                </button>
              </>
            ) : (
              <>
                <button type="button" disabled={saving} onClick={() => save("will_provide_later")} className="text-xs font-semibold text-ink border border-line rounded-sm px-2 py-1">
                  I&apos;ll provide this securely later
                </button>
                <button type="button" disabled={saving} onClick={() => save("need_help")} className="text-xs font-semibold text-ink border border-line rounded-sm px-2 py-1">
                  I need help locating this information
                </button>
              </>
            )}
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted underline">
              Cancel
            </button>
          </div>

          <input
            type="text"
            placeholder="Add a note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-xs bg-white"
          />

          {error && <p className="text-xs text-brick">{error}</p>}
        </div>
      )}

      <p className="text-xs text-muted mt-2">
        This is stored securely and encrypted. Only authorized staff can view the full number, and only for a
        documented reason.
      </p>
    </div>
  );
}
