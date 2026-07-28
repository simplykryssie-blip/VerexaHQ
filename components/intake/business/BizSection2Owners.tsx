"use client";

import { Card, SectionHeading, TextField, Select, YesNo, BlankableNumberField, DateField, DisclaimerNote } from "../fields";
import { SecureIdentityField } from "../SecureIdentityField";
import { getArray, getStr, type AnyRecord } from "@/lib/intakeAnswers";
import { OWNER_ROLE_OPTIONS, BASIS_RECORDS_OPTIONS } from "@/lib/businessIntakeOptions";

const S_CORP_TAXED = new Set(["s_corp", "smllc_s_corp", "mmllc_s_corp"]);
const PARTNERSHIP_TAXED = new Set(["partnership", "mmllc_partnership"]);

function newLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `owner-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyOwner(): AnyRecord {
  return {
    local_id: newLocalId(),
    full_name: "",
    role: "",
    ownership_pct: null,
    ownership_unsure: false,
    received_compensation: false,
    received_distributions: false,
    had_loans: false,
    is_foreign: false,
    received_guaranteed_payments: false,
    shareholder_health_insurance: false,
    ownership_changed_during_year: false,
    ownership_pct_beginning: null,
    ownership_change_effective_date: "",
  };
}

export function BizSection2Owners({
  token,
  answers,
  setAnswer,
  entityClassification,
}: {
  token: string;
  answers: AnyRecord;
  setAnswer: (path: string[], value: unknown) => void;
  entityClassification: string | null;
}) {
  const isSCorpTaxed = S_CORP_TAXED.has(entityClassification || "");
  const isPartnershipTaxed = PARTNERSHIP_TAXED.has(entityClassification || "");
  const owners = getArray<AnyRecord>(answers, ["owners"]);
  const ownershipStructure = (answers.ownership_structure as AnyRecord) || {};

  const pctTotal = owners.reduce((sum, o) => {
    const pct = o.ownership_pct;
    return typeof pct === "number" ? sum + pct : sum;
  }, 0);
  const anyPctEntered = owners.some((o) => typeof o.ownership_pct === "number");
  const pctMismatch = anyPctEntered && Math.abs(pctTotal - 100) > 0.5;

  function updateOwner(i: number, patch: Partial<AnyRecord>) {
    const next = owners.map((o, idx) => (idx === i ? { ...o, ...patch } : o));
    setAnswer(["owners"], next);
  }

  function addOwner() {
    setAnswer(["owners"], [...owners, emptyOwner()]);
  }

  function removeOwner(i: number) {
    setAnswer(["owners"], owners.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Owners, Shareholders & Partners"
        hint="Tell us about everyone with an ownership interest in the business."
      />

      {owners.length === 0 && (
        <DisclaimerNote>No owners added yet. Add at least one below.</DisclaimerNote>
      )}

      <div className="space-y-3">
        {owners.map((owner, i) => (
          <Card key={String(owner.local_id || i)}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted">Owner {i + 1}</span>
              <button type="button" onClick={() => removeOwner(i)} className="text-xs text-brick underline">
                Remove
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField label="Full legal name" value={getStr(owner, ["full_name"])} onChange={(v) => updateOwner(i, { full_name: v })} />
              <Select
                label="Role"
                value={getStr(owner, ["role"])}
                onChange={(v) => updateOwner(i, { role: v })}
                options={OWNER_ROLE_OPTIONS}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 items-end">
              <BlankableNumberField
                label="Ownership percentage"
                value={(owner.ownership_pct as number) ?? null}
                onChange={(v) => updateOwner(i, { ownership_pct: v })}
              />
              <label className="flex items-center gap-2 text-xs text-ink py-2">
                <input
                  type="checkbox"
                  checked={!!owner.ownership_unsure}
                  onChange={(e) => updateOwner(i, { ownership_unsure: e.target.checked, ownership_pct: e.target.checked ? null : owner.ownership_pct })}
                />
                I&apos;m not sure of this owner&apos;s exact percentage
              </label>
            </div>

            <div className="mt-3">
              <SecureIdentityField
                token={token}
                personType="owner"
                personRef={String(owner.local_id || "")}
                personLabel={getStr(owner, ["full_name"]) || `Owner ${i + 1}`}
                kind="owner_tax_id"
                required
              />
            </div>

            <div className="mt-3 space-y-1">
              <YesNo
                label="Did this owner receive compensation (salary/wages) from the business?"
                value={!!owner.received_compensation}
                onChange={(v) => updateOwner(i, { received_compensation: v })}
              />
              <YesNo
                label="Did this owner receive distributions from the business?"
                value={!!owner.received_distributions}
                onChange={(v) => updateOwner(i, { received_distributions: v })}
              />
              <YesNo
                label="Did this owner make or receive any loans to/from the business?"
                value={!!owner.had_loans}
                onChange={(v) => updateOwner(i, { had_loans: v })}
              />
              <YesNo
                label="Is this owner a foreign person (not a U.S. citizen or resident)?"
                value={!!owner.is_foreign}
                onChange={(v) => updateOwner(i, { is_foreign: v })}
              />
              {isPartnershipTaxed && (
                <YesNo
                  label="Did this owner receive guaranteed payments from the business?"
                  value={!!owner.received_guaranteed_payments}
                  onChange={(v) => updateOwner(i, { received_guaranteed_payments: v })}
                />
              )}
              {isSCorpTaxed && (
                <YesNo
                  label="Did the business pay for this owner's health insurance?"
                  value={!!owner.shareholder_health_insurance}
                  onChange={(v) => updateOwner(i, { shareholder_health_insurance: v })}
                />
              )}
              <YesNo
                label="Did this owner's ownership percentage change during the year?"
                value={!!owner.ownership_changed_during_year}
                onChange={(v) => updateOwner(i, { ownership_changed_during_year: v })}
              />
            </div>

            {!!owner.ownership_changed_during_year && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-line">
                <BlankableNumberField
                  label="Ownership percentage at the start of the year"
                  value={(owner.ownership_pct_beginning as number) ?? null}
                  onChange={(v) => updateOwner(i, { ownership_pct_beginning: v })}
                />
                <DateField
                  label="Date the change took effect"
                  value={getStr(owner, ["ownership_change_effective_date"])}
                  onChange={(v) => updateOwner(i, { ownership_change_effective_date: v })}
                />
              </div>
            )}
          </Card>
        ))}
      </div>

      <button type="button" onClick={addOwner} className="text-sm font-semibold text-blue underline">
        + Add another owner
      </button>

      {pctMismatch && (
        <DisclaimerNote>
          The ownership percentages entered add up to {pctTotal}%, not 100%. That&apos;s okay for
          now — we&apos;ll flag this for our team to confirm with you.
        </DisclaimerNote>
      )}

      <Card>
        <Select
          label="Do you have records showing each owner's investment and activity in the business?"
          value={getStr(ownershipStructure, ["basis_records"])}
          onChange={(v) => setAnswer(["ownership_structure", "basis_records"], v)}
          options={BASIS_RECORDS_OPTIONS}
        />
        <p className="text-xs text-muted mt-1">
          This includes contributions, distributions, and prior basis worksheets, if you have them.
        </p>
      </Card>
    </div>
  );
}
