"use client";

import { Card, SubHeading, TextField, YesNo } from "./fields";
import { getBool, getStr, type AnyRecord } from "@/lib/intakeAnswers";

// Spouse detail. Deliberately does not collect a full SSN anywhere (per
// firm policy for this intake -- SSN cards are handled as an uploaded
// document, never typed into a form field or shown in a list view), and
// nothing here is masked/restricted beyond that because nothing sensitive
// enough to need masking (no SSN, no financial account numbers) is
// collected in this section.
export function SpouseSection({ spouse, onChange }: { spouse: AnyRecord; onChange: (key: string, value: unknown) => void }) {
  const diedDuringYear = getBool(spouse, ["died_during_year"]);
  return (
    <Card>
      <SubHeading title="Spouse information" />
      <p className="text-xs text-muted mb-3">
        We don&apos;t collect a full Social Security number here -- you&apos;ll upload a Social Security
        card or ID separately if needed.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField label="Legal first name" value={getStr(spouse, ["first_name"])} onChange={(v) => onChange("first_name", v)} />
        <TextField label="Middle name / initial" value={getStr(spouse, ["middle_name"])} onChange={(v) => onChange("middle_name", v)} />
        <TextField label="Legal last name" value={getStr(spouse, ["last_name"])} onChange={(v) => onChange("last_name", v)} />
        <TextField label="Suffix" value={getStr(spouse, ["suffix"])} onChange={(v) => onChange("suffix", v)} placeholder="Jr., Sr., III…" />
        <TextField label="Date of birth" type="date" value={getStr(spouse, ["dob"])} onChange={(v) => onChange("dob", v)} />
        <TextField label="Email" type="email" value={getStr(spouse, ["email"])} onChange={(v) => onChange("email", v)} />
        <TextField label="Mobile number" type="tel" value={getStr(spouse, ["phone"])} onChange={(v) => onChange("phone", v)} />
      </div>
      <div className="mt-2 divide-y divide-line">
        <YesNo label="Lived with you during the year" value={getBool(spouse, ["lived_with_taxpayer"])} onChange={(v) => onChange("lived_with_taxpayer", v)} />
        <YesNo label="Had income of their own" value={getBool(spouse, ["had_income"])} onChange={(v) => onChange("had_income", v)} />
        <YesNo label="Has a separate tax preparer" value={getBool(spouse, ["separate_preparer"])} onChange={(v) => onChange("separate_preparer", v)} />
        <YesNo label="Available to sign the return" value={getBool(spouse, ["available_to_sign"])} onChange={(v) => onChange("available_to_sign", v)} />
        <YesNo label="Has an IRS Identity Protection PIN" value={getBool(spouse, ["has_ip_pin"])} onChange={(v) => onChange("has_ip_pin", v)} />
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
