"use client";

import { Card, SubHeading, TextField, Select, YesNo, Checkbox } from "./fields";
import { StatesMultiSelect } from "./StatesMultiSelect";
import { SpouseSection } from "./SpouseSection";
import { DependentsSection } from "./DependentsSection";
import { TemporaryAbsences } from "./TemporaryAbsences";
import { getBool, getStr, getArray, type AnyRecord } from "@/lib/intakeAnswers";
import { STATES_WITH_LOCAL_TAX_RELEVANCE } from "@/lib/intakeStates";

const FILING_STATUSES: [string, string][] = [
  ["", "Select…"],
  ["single", "Single"],
  ["married_filing_jointly", "Married Filing Jointly"],
  ["married_filing_separately", "Married Filing Separately"],
  ["head_of_household", "Head of Household"],
  ["qualifying_surviving_spouse", "Qualifying Surviving Spouse"],
  ["unsure", "Unsure — let's discuss"],
];

// This section is the single authoritative place for: prior-year return
// availability, IP PIN / identity theft (taxpayer-level), and states
// lived/worked in. Life Changes (Section 5) references these via a
// read-only summary instead of asking again -- see Section5LifeChanges.
export function Section2Household({ answers, setAnswer }: { answers: AnyRecord; setAnswer: (path: string[], value: unknown) => void }) {
  const filingStatus = getStr(answers, ["filing_status_expected"]);
  const marriage = (answers.marriage as AnyRecord) || {};
  const marriedDuringYear = getBool(marriage, ["married_during_year"]);
  const separatedNotDivorced = getBool(marriage, ["separated_not_divorced"]);
  const showSpouse =
    filingStatus === "married_filing_jointly" ||
    filingStatus === "married_filing_separately" ||
    filingStatus === "qualifying_surviving_spouse" ||
    marriedDuringYear ||
    separatedNotDivorced;

  const taxpayer = (answers.taxpayer_detail as AnyRecord) || {};
  const priorFiling = (answers.prior_filing as AnyRecord) || {};
  const spouse = (answers.spouse as AnyRecord) || {};
  const dependents = getArray<AnyRecord>(answers, ["dependents"]);
  const states = getArray<string>(answers, ["states_lived_worked"]);

  const schoolDistrictRelevant = states.some((s) => STATES_WITH_LOCAL_TAX_RELEVANCE.has(s));
  const schoolDistrictStatus = getStr(taxpayer, ["school_district_status"]);

  return (
    <div className="space-y-4">
      <SubHeading title="About you" />
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField label="Occupation" value={getStr(taxpayer, ["occupation"])} onChange={(v) => setAnswer(["taxpayer_detail", "occupation"], v)} />
          <TextField label="Current address" value={getStr(taxpayer, ["current_address"])} onChange={(v) => setAnswer(["taxpayer_detail", "current_address"], v)} />
          <TextField label="Prior-year address (if moved)" value={getStr(taxpayer, ["prior_address"])} onChange={(v) => setAnswer(["taxpayer_detail", "prior_address"], v)} />
        </div>

        <div className="mt-2 divide-y divide-line">
          <YesNo
            label="Has your legal name changed since your last tax return?"
            value={getBool(taxpayer, ["name_changed"])}
            onChange={(v) => setAnswer(["taxpayer_detail", "name_changed"], v)}
          />
          {getBool(taxpayer, ["name_changed"]) && (
            <div className="py-2">
              <TextField label="Prior legal name" value={getStr(taxpayer, ["prior_name"])} onChange={(v) => setAnswer(["taxpayer_detail", "prior_name"], v)} />
            </div>
          )}
          <YesNo
            label="Do you have a mailing address different from your home address?"
            value={getBool(taxpayer, ["mailing_address_different"])}
            onChange={(v) => setAnswer(["taxpayer_detail", "mailing_address_different"], v)}
          />
          {getBool(taxpayer, ["mailing_address_different"]) && (
            <div className="py-2">
              <TextField label="Mailing address" value={getStr(taxpayer, ["mailing_address"])} onChange={(v) => setAnswer(["taxpayer_detail", "mailing_address"], v)} />
            </div>
          )}
          <YesNo
            label="Were you a full-year resident of your state this year?"
            value={getBool(taxpayer, ["full_year_resident"])}
            onChange={(v) => setAnswer(["taxpayer_detail", "full_year_resident"], v)}
          />
          {getBool(taxpayer, ["full_year_resident"]) === false && (
            <div className="py-2">
              <TextField label="Residency dates (partial-year)" value={getStr(taxpayer, ["residency_dates"])} onChange={(v) => setAnswer(["taxpayer_detail", "residency_dates"], v)} />
            </div>
          )}
        </div>

        {(schoolDistrictRelevant || schoolDistrictStatus) && (
          <div className="mt-3 pt-3 border-t border-line">
            <TextField label="County / parish" value={getStr(taxpayer, ["county"])} onChange={(v) => setAnswer(["taxpayer_detail", "county"], v)} />
            <div className="mt-2">
              <Select
                label="School district or local tax district, if applicable"
                value={schoolDistrictStatus}
                onChange={(v) => setAnswer(["taxpayer_detail", "school_district_status"], v)}
                options={[
                  ["", "Select…"],
                  ["known", "I know it — enter below"],
                  ["not_sure", "Not sure"],
                  ["not_applicable", "Not applicable"],
                ]}
              />
            </div>
            {schoolDistrictStatus === "known" && (
              <div className="mt-2">
                <TextField
                  label="District name"
                  value={getStr(taxpayer, ["school_district"])}
                  onChange={(v) => setAnswer(["taxpayer_detail", "school_district"], v)}
                />
              </div>
            )}
          </div>
        )}

        <div className="mt-2 divide-y divide-line">
          <YesNo label="U.S. citizen or resident" value={getBool(taxpayer, ["citizen_or_resident"])} onChange={(v) => setAnswer(["taxpayer_detail", "citizen_or_resident"], v)} />
          <YesNo label="Legally blind" value={getBool(taxpayer, ["blind"])} onChange={(v) => setAnswer(["taxpayer_detail", "blind"], v)} />
          <YesNo label="Have a disability" value={getBool(taxpayer, ["disabled"])} onChange={(v) => setAnswer(["taxpayer_detail", "disabled"], v)} />
          <YesNo label="Have an IRS Identity Protection PIN" value={getBool(taxpayer, ["ip_pin"])} onChange={(v) => setAnswer(["taxpayer_detail", "ip_pin"], v)} />
          <YesNo label="Have been a victim of tax-related identity theft" value={getBool(taxpayer, ["identity_theft"])} onChange={(v) => setAnswer(["taxpayer_detail", "identity_theft"], v)} />
          <YesNo label="Passed away during the tax year" value={getBool(taxpayer, ["deceased"])} onChange={(v) => setAnswer(["taxpayer_detail", "deceased"], v)} />
          {getBool(taxpayer, ["deceased"]) && (
            <div className="py-2">
              <TextField label="Date of death" type="date" value={getStr(taxpayer, ["date_of_death"])} onChange={(v) => setAnswer(["taxpayer_detail", "date_of_death"], v)} />
            </div>
          )}
        </div>
      </Card>

      <SubHeading title="Filing status" />
      <Card>
        <Select label="Expected filing status" value={filingStatus} onChange={(v) => setAnswer(["filing_status_expected"], v)} options={FILING_STATUSES} />
        <div className="mt-2 divide-y divide-line">
          <YesNo label="Married at any point during the tax year" value={marriedDuringYear} onChange={(v) => setAnswer(["marriage", "married_during_year"], v)} />
          <YesNo label="Separated but not legally divorced" value={separatedNotDivorced} onChange={(v) => setAnswer(["marriage", "separated_not_divorced"], v)} />
        </div>
        {(marriedDuringYear || separatedNotDivorced || filingStatus.startsWith("married")) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <TextField label="Date married" type="date" value={getStr(marriage, ["date_married"])} onChange={(v) => setAnswer(["marriage", "date_married"], v)} />
            <TextField label="Date separated" type="date" value={getStr(marriage, ["date_separated"])} onChange={(v) => setAnswer(["marriage", "date_separated"], v)} />
            <TextField label="Date divorced" type="date" value={getStr(marriage, ["date_divorced"])} onChange={(v) => setAnswer(["marriage", "date_divorced"], v)} />
          </div>
        )}
        {(separatedNotDivorced || filingStatus === "married_filing_separately") && (
          <div className="mt-2 divide-y divide-line">
            <YesNo label="Have a divorce decree or separation agreement" value={getBool(marriage, ["has_decree"])} onChange={(v) => setAnswer(["marriage", "has_decree"], v)} />
            <YesNo label="Spouse lived in the home" value={getBool(marriage, ["spouse_lived_in_home"])} onChange={(v) => setAnswer(["marriage", "spouse_lived_in_home"], v)} />
            <YesNo label="Either spouse has remarried" value={getBool(marriage, ["either_remarried"])} onChange={(v) => setAnswer(["marriage", "either_remarried"], v)} />
            <YesNo label="Spouse itemizes deductions" value={getBool(marriage, ["spouse_itemizes"])} onChange={(v) => setAnswer(["marriage", "spouse_itemizes"], v)} />
            <YesNo label="You live in a community-property state" value={getBool(marriage, ["community_property"])} onChange={(v) => setAnswer(["marriage", "community_property"], v)} />
          </div>
        )}
      </Card>

      {showSpouse && <SpouseSection spouse={spouse} onChange={(key, value) => setAnswer(["spouse", key], value)} />}

      <DependentsSection dependents={dependents} onChange={(next) => setAnswer(["dependents"], next)} />

      <SubHeading title="Household" />
      <Card>
        <TemporaryAbsences answers={answers} setAnswer={setAnswer} />
      </Card>

      <SubHeading title="Prior filing" />
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField label="Prior-year filing status" value={getStr(priorFiling, ["prior_status"])} onChange={(v) => setAnswer(["prior_filing", "prior_status"], v)} />
          <TextField label="Prior preparer (if any)" value={getStr(priorFiling, ["prior_preparer"])} onChange={(v) => setAnswer(["prior_filing", "prior_preparer"], v)} />
        </div>
        <div className="mt-2 divide-y divide-line">
          <YesNo label="I have a copy of my prior-year tax return" value={getBool(answers, ["has_prior_year_return"])} onChange={(v) => setAnswer(["has_prior_year_return"], v)} />
          <YesNo label="Filed an extension" value={getBool(priorFiling, ["extension_filed"])} onChange={(v) => setAnswer(["prior_filing", "extension_filed"], v)} />
        </div>
        <p className="text-xs text-muted mt-2">
          IRS/state notices, unfiled years, carryovers, and amended returns are covered in the
          Life Changes and Adjustments sections, and in the amended-return checkbox below.
        </p>
      </Card>

      <SubHeading title="States" />
      <Card>
        <StatesMultiSelect value={states} onChange={(codes) => setAnswer(["states_lived_worked"], codes)} />
      </Card>

      <Checkbox
        label="This is an amended or prior-year return (not an original current-year filing)"
        checked={getStr(answers, ["return_variant"]) === "amended" || getStr(answers, ["return_variant"]) === "prior_year"}
        onChange={(v) => setAnswer(["return_variant"], v ? "amended" : "original")}
      />
    </div>
  );
}
