"use client";

import { Card, SubHeading, Checkbox, TextArea, TextField, YesNo, Select } from "./fields";
import { getBool, getStr, getArray, type AnyRecord } from "@/lib/intakeAnswers";
import { stateLabel } from "@/lib/intakeStates";

// Step 5 is reduced to five plain-language groups covering only unusual
// events not already captured by identity/household/income/deductions.
// Several options below (foreign income, lawsuit settlement, gambling,
// canceled debt, casualty loss) are the SAME fact as a checkbox already
// asked in Section 3 or Section 4 -- rather than creating a second,
// disconnected answer key, those checkboxes here read/write the exact
// same authoritative key, so there is still only one answer regardless of
// which screen the client uses.
export function Section5LifeChanges({ answers, setAnswer }: { answers: AnyRecord; setAnswer: (path: string[], value: unknown) => void }) {
  const lifeChanges = (answers.life_changes as AnyRecord) || {};
  const property = (lifeChanges.property as AnyRecord) || {};
  const taxCompliance = (lifeChanges.tax_compliance as AnyRecord) || {};
  const foreign = (lifeChanges.foreign as AnyRecord) || {};
  const legalFinancial = (lifeChanges.legal_financial as AnyRecord) || {};
  const estatesTrusts = (lifeChanges.estates_trusts as AnyRecord) || {};
  const otherIncome = (answers.other_income as AnyRecord) || {};
  const deductions = (answers.deductions as AnyRecord) || {};

  const taxpayer = (answers.taxpayer_detail as AnyRecord) || {};
  const states = getArray<string>(answers, ["states_lived_worked"]);

  return (
    <div className="space-y-4">
      <SubHeading title="Major Changes and Special Tax Situations" />
      <p className="text-sm text-muted">
        Select only events that occurred during the tax year and were not already reported in an earlier section.
      </p>

      {states.length > 1 && (
        <p className="text-xs text-muted bg-paperDim border border-line rounded-sm px-2.5 py-1.5">
          States lived/worked in this year (from Household & Filing Basics): {states.map(stateLabel).join(", ")} —
          already noted as a multistate return.
        </p>
      )}

      <Card>
        <SubHeading title="Property and Assets" />
        <p className="text-sm text-ink mb-2">Did you sell, inherit, receive as a gift, lose, or change the use of any property?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <Checkbox label="Sold a home" checked={getBool(property, ["sold_home"])} onChange={(v) => setAnswer(["life_changes", "property", "sold_home"], v)} />
          <Checkbox
            label="Converted a home to rental use"
            checked={getBool(property, ["rental_conversion"])}
            onChange={(v) => setAnswer(["life_changes", "property", "rental_conversion"], v)}
          />
          <Checkbox
            label="Foreclosure or short sale"
            checked={getBool(property, ["foreclosure_or_short_sale"])}
            onChange={(v) => setAnswer(["life_changes", "property", "foreclosure_or_short_sale"], v)}
          />
          <Checkbox label="Inherited property" checked={getBool(property, ["inherited_property"])} onChange={(v) => setAnswer(["life_changes", "property", "inherited_property"], v)} />
          <Checkbox label="Received gifted property" checked={getBool(property, ["gifted_property"])} onChange={(v) => setAnswer(["life_changes", "property", "gifted_property"], v)} />
          <Checkbox label="Like-kind exchange" checked={getBool(property, ["like_kind_exchange"])} onChange={(v) => setAnswer(["life_changes", "property", "like_kind_exchange"], v)} />
          <Checkbox label="Other property event" checked={getBool(property, ["other"])} onChange={(v) => setAnswer(["life_changes", "property", "other"], v)} />
        </div>
      </Card>

      <Card>
        <SubHeading title="Tax Problems" />
        <p className="text-sm text-ink mb-2">Did you have a tax issue that was not already reported earlier?</p>
        <p className="text-xs text-muted mb-2 bg-paperDim border border-line rounded-sm px-2.5 py-1.5">
          IP PIN and identity theft are answered in the About You section (Household & Filing Basics): Identity
          theft — {getBool(taxpayer, ["identity_theft"]) ? "Yes" : "No"}.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <Checkbox label="IRS notice" checked={getBool(answers, ["has_irs_state_notice"])} onChange={(v) => setAnswer(["has_irs_state_notice"], v)} />
          <Checkbox label="State notice" checked={getBool(answers, ["has_irs_state_notice"])} onChange={(v) => setAnswer(["has_irs_state_notice"], v)} />
          <Checkbox label="Unfiled return" checked={getBool(answers, ["has_unfiled_years"])} onChange={(v) => setAnswer(["has_unfiled_years"], v)} />
          <Checkbox label="Audit" checked={getBool(taxCompliance, ["audit"])} onChange={(v) => setAnswer(["life_changes", "tax_compliance", "audit"], v)} />
          <Checkbox
            label="Installment agreement"
            checked={getBool(taxCompliance, ["installment_agreement"])}
            onChange={(v) => setAnswer(["life_changes", "tax_compliance", "installment_agreement"], v)}
          />
          <Checkbox label="Levy or lien" checked={getBool(taxCompliance, ["levy_or_lien"])} onChange={(v) => setAnswer(["life_changes", "tax_compliance", "levy_or_lien"], v)} />
          <Checkbox
            label="Prior return was rejected"
            checked={getBool(taxCompliance, ["prior_rejected_return"])}
            onChange={(v) => setAnswer(["life_changes", "tax_compliance", "prior_rejected_return"], v)}
          />
          <Checkbox
            label="Identity theft issue not already reported"
            checked={getBool(taxCompliance, ["identity_theft_new"])}
            onChange={(v) => setAnswer(["life_changes", "tax_compliance", "identity_theft_new"], v)}
          />
          <Checkbox
            label="Other compliance issue"
            checked={getBool(taxCompliance, ["other_compliance_issue"])}
            onChange={(v) => setAnswer(["life_changes", "tax_compliance", "other_compliance_issue"], v)}
          />
        </div>
      </Card>

      <Card>
        <SubHeading title="Foreign Activity" />
        <p className="text-sm text-ink mb-2">Did you have income, accounts, property, gifts, or business activity outside the United States?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <Checkbox label="Foreign income" checked={getBool(answers, ["has_foreign_income"])} onChange={(v) => setAnswer(["has_foreign_income"], v)} />
          <Checkbox label="Foreign bank account" checked={getBool(foreign, ["foreign_bank_accounts"])} onChange={(v) => setAnswer(["life_changes", "foreign", "foreign_bank_accounts"], v)} />
          <Checkbox label="Foreign financial assets" checked={getBool(foreign, ["foreign_assets"])} onChange={(v) => setAnswer(["life_changes", "foreign", "foreign_assets"], v)} />
          <Checkbox label="Foreign trust" checked={getBool(foreign, ["foreign_trust"])} onChange={(v) => setAnswer(["life_changes", "foreign", "foreign_trust"], v)} />
          <Checkbox
            label="Foreign business ownership"
            checked={getBool(foreign, ["foreign_business_ownership"])}
            onChange={(v) => setAnswer(["life_changes", "foreign", "foreign_business_ownership"], v)}
          />
          <Checkbox label="Foreign gift" checked={getBool(foreign, ["foreign_gifts"])} onChange={(v) => setAnswer(["life_changes", "foreign", "foreign_gifts"], v)} />
          <Checkbox label="Foreign inheritance" checked={getBool(foreign, ["foreign_inheritance"])} onChange={(v) => setAnswer(["life_changes", "foreign", "foreign_inheritance"], v)} />
          <Checkbox label="Other foreign activity" checked={getBool(foreign, ["other"])} onChange={(v) => setAnswer(["life_changes", "foreign", "other"], v)} />
        </div>
      </Card>

      <Card>
        <SubHeading title="Legal or Financial Events" />
        <p className="text-sm text-ink mb-2">Did you experience any of these legal or financial events?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <Checkbox
            label="Canceled debt"
            checked={getBool(otherIncome, ["cancellation_of_debt"])}
            onChange={(v) => setAnswer(["other_income", "cancellation_of_debt"], v)}
          />
          <Checkbox label="Bankruptcy" checked={getBool(legalFinancial, ["bankruptcy"])} onChange={(v) => setAnswer(["life_changes", "legal_financial", "bankruptcy"], v)} />
          <Checkbox
            label="Foreclosure not already reported"
            checked={getBool(legalFinancial, ["foreclosure_not_reported"])}
            onChange={(v) => setAnswer(["life_changes", "legal_financial", "foreclosure_not_reported"], v)}
          />
          <Checkbox
            label="Lawsuit settlement"
            checked={getBool(otherIncome, ["lawsuit_settlements"])}
            onChange={(v) => setAnswer(["other_income", "lawsuit_settlements"], v)}
          />
          <Checkbox label="Major gambling activity" checked={getBool(otherIncome, ["gambling"])} onChange={(v) => setAnswer(["other_income", "gambling"], v)} />
          <Checkbox
            label="Disaster or casualty loss"
            checked={getBool(deductions, ["casualty_loss"])}
            onChange={(v) => setAnswer(["deductions", "casualty_loss"], v)}
          />
          <Checkbox label="Other" checked={getBool(legalFinancial, ["other"])} onChange={(v) => setAnswer(["life_changes", "legal_financial", "other"], v)} />
        </div>
      </Card>

      <Card>
        <SubHeading title="Estates and Trusts" />
        <Select
          label="Did you receive money or property from an estate or trust?"
          value={getStr(estatesTrusts, ["received"])}
          onChange={(v) => setAnswer(["life_changes", "estates_trusts", "received"], v)}
          options={[
            ["", "Select…"],
            ["yes", "Yes"],
            ["no", "No"],
            ["unsure", "Unsure"],
          ]}
        />
        {getStr(estatesTrusts, ["received"]) === "yes" && (
          <div className="mt-2">
            <TextField
              label="Estate or trust name (if known)"
              value={getStr(estatesTrusts, ["name"])}
              onChange={(v) => setAnswer(["life_changes", "estates_trusts", "name"], v)}
            />
          </div>
        )}
        <div className="mt-2 divide-y divide-line">
          <YesNo
            label="Did you become an executor or beneficiary this year?"
            value={getBool(estatesTrusts, ["became_executor_or_beneficiary"])}
            onChange={(v) => setAnswer(["life_changes", "estates_trusts", "became_executor_or_beneficiary"], v)}
          />
          <YesNo
            label="Are you filing a final return for someone who passed away?"
            value={getBool(estatesTrusts, ["filing_final_return"])}
            onChange={(v) => setAnswer(["life_changes", "estates_trusts", "filing_final_return"], v)}
          />
        </div>
      </Card>

      <Card>
        <SubHeading title="Anything else we should know?" />
        <TextArea
          label="Other special situations"
          value={getStr(lifeChanges, ["other_notes"])}
          onChange={(v) => setAnswer(["life_changes", "other_notes"], v)}
        />
      </Card>
    </div>
  );
}
