"use client";

import { Card, SubHeading, TextField, YesNo } from "./fields";
import { SecureIdentityField } from "./SecureIdentityField";
import { getBool, getStr, type AnyRecord } from "@/lib/intakeAnswers";

// Spouse detail. SSN/ITIN is captured through the secure identity vault
// below, never as a plain text field and never stored in this answers
// object -- see SecureIdentityField / intake_identity_vault.
export function SpouseSection({
  spouse,
  onChange,
  token,
  filingStatus,
}: {
  spouse: AnyRecord;
  onChange: (key: string, value: unknown) => void;
  token: string;
  filingStatus: string;
}) {
  const diedDuringYear = getBool(spouse, ["died_during_year"]);
  // For MFS, "lived with you" is already answered via marriage.marital_situation
  // (married_living_together vs. married_living_apart) -- asking it again
  // here would be the same fact twice. Still asked for MFJ/QSS, which have
  // no equivalent question.
  const showLivedWithTaxpayer = filingStatus !== "married_filing_separately";
  return (
    <Card>
      <SubHeading title="Spouse information" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField label="Legal first name" value={getStr(spouse, ["first_name"])} onChange={(v) => onChange("first_name", v)} />
        <TextField label="Middle name / initial" value={getStr(spouse, ["middle_name"])} onChange={(v) => onChange("middle_name", v)} />
        <TextField label="Legal last name" value={getStr(spouse, ["last_name"])} onChange={(v) => onChange("last_name", v)} />
        <TextField label="Suffix" value={getStr(spouse, ["suffix"])} onChange={(v) => onChange("suffix", v)} placeholder="Jr., Sr., III…" />
        <TextField label="Date of birth *" type="date" value={getStr(spouse, ["dob"])} onChange={(v) => onChange("dob", v)} />
        <TextField label="Email" type="email" value={getStr(spouse, ["email"])} onChange={(v) => onChange("email", v)} />
        <TextField label="Mobile number" type="tel" value={getStr(spouse, ["phone"])} onChange={(v) => onChange("phone", v)} />
      </div>

      <div className="mt-3">
        <SecureIdentityField token={token} personType="spouse" personRef={null} personLabel="Spouse's" kind="tax_id" required />
        <div className="mt-2">
          <SecureIdentityField token={token} personType="spouse" personRef={null} personLabel="Spouse's" kind="ip_pin" />
        </div>
      </div>

      <div className="mt-2 divide-y divide-line">
        {showLivedWithTaxpayer && (
          <YesNo label="Lived with you during the year" value={getBool(spouse, ["lived_with_taxpayer"])} onChange={(v) => onChange("lived_with_taxpayer", v)} />
        )}
        <YesNo label="Had income of their own" value={getBool(spouse, ["had_income"])} onChange={(v) => onChange("had_income", v)} />
        <YesNo label="Has a separate tax preparer" value={getBool(spouse, ["separate_preparer"])} onChange={(v) => onChange("separate_preparer", v)} />
        <YesNo label="Available to sign the return" value={getBool(spouse, ["available_to_sign"])} onChange={(v) => onChange("available_to_sign", v)} />
        <YesNo label="U.S. citizen or resident" value={getBool(spouse, ["citizen_or_resident"])} onChange={(v) => onChange("citizen_or_resident", v)} />
        <YesNo label="Passed away during the tax year" value={diedDuringYear} onChange={(v) => onChange("died_during_year", v)} />
        {diedDuringYear && (
          <div className="py-2">
            <TextField label="Date of death" type="date" value={getStr(spouse, ["date_of_death"])} onChange={(v) => onChange("date_of_death", v)} />
          </div>
        )}
        <YesNo
          label="Spouse's information changed since your prior return"
          value={getBool(spouse, ["info_changed_since_prior"])}
          onChange={(v) => onChange("info_changed_since_prior", v)}
        />
      </div>
    </Card>
  );
}
