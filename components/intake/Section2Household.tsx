"use client";

import { Card, SubHeading, TextField, Select, YesNo, Checkbox, DisclaimerNote } from "./fields";
import { StatesMultiSelect } from "./StatesMultiSelect";
import { SpouseSection } from "./SpouseSection";
import { DependentsSection } from "./DependentsSection";
import { TemporaryAbsences } from "./TemporaryAbsences";
import { SecureIdentityField } from "./SecureIdentityField";
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

const PRIOR_FILING_STATUSES: [string, string][] = [
  ["", "Select…"],
  ["single", "Single"],
  ["married_filing_jointly", "Married Filing Jointly"],
  ["married_filing_separately", "Married Filing Separately"],
  ["head_of_household", "Head of Household"],
  ["qualifying_surviving_spouse", "Qualifying Surviving Spouse"],
  ["did_not_file", "Did not file"],
  ["unsure", "Unsure"],
];

const MARITAL_SITUATION_OPTIONS: [string, string][] = [
  ["", "Select…"],
  ["married_living_together", "Married and living together"],
  ["married_living_apart", "Married but living apart"],
  ["separated_decree", "Legally separated under a final decree"],
  ["divorced_decree", "Divorced under a final decree"],
  ["spouse_died", "Spouse died during the year"],
  ["unsure", "Unsure"],
];

function NameChangeSubform({
  title,
  data,
  onChange,
}: {
  title: string;
  data: AnyRecord;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="border border-line rounded-sm p-3 mt-2">
      <div className="text-xs font-semibold text-muted mb-2">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField label="Previous legal name" value={getStr(data, ["previous_legal_name"])} onChange={(v) => onChange("previous_legal_name", v)} />
        <TextField label="Current legal name" value={getStr(data, ["current_legal_name"])} onChange={(v) => onChange("current_legal_name", v)} />
        <TextField label="Reason for the change" value={getStr(data, ["reason"])} onChange={(v) => onChange("reason", v)} placeholder="Marriage, divorce, court order…" />
        <TextField label="Name currently shown on tax documents" value={getStr(data, ["name_on_tax_documents"])} onChange={(v) => onChange("name_on_tax_documents", v)} />
      </div>
      <div className="mt-1">
        <YesNo
          label="Has the Social Security Administration record been updated?"
          value={getBool(data, ["ssa_updated"])}
          onChange={(v) => onChange("ssa_updated", v)}
        />
      </div>
    </div>
  );
}

// This section is the single authoritative place for: prior-year return
// availability, IP PIN / identity theft (taxpayer-level), and states
// lived/worked in. Life Changes (Section 5) references these via a
// read-only summary instead of asking again -- see Section5LifeChanges.
export function Section2Household({
  answers,
  setAnswer,
  token,
  taxYear,
}: {
  answers: AnyRecord;
  setAnswer: (path: string[], value: unknown) => void;
  token: string;
  taxYear: number;
}) {
  const filingStatus = getStr(answers, ["filing_status_expected"]);
  const marriage = (answers.marriage as AnyRecord) || {};
  const showSpouse =
    filingStatus === "married_filing_jointly" ||
    filingStatus === "married_filing_separately" ||
    filingStatus === "qualifying_surviving_spouse";

  // expected_filing_status is the sole authoritative trigger for which
  // marital questions render below -- switching status clears the entire
  // marriage namespace so an answer collected under one status can never
  // linger as an active, hidden value after switching to a different
  // status. Previously submitted versions are unaffected: intake_versions
  // snapshots answers at submission time; this only prunes the live,
  // unsubmitted draft.
  function handleFilingStatusChange(next: string) {
    setAnswer(["filing_status_expected"], next);
    setAnswer(["marriage"], {});
    setAnswer(
      ["has_spouse"],
      next === "married_filing_jointly" || next === "married_filing_separately" || next === "qualifying_surviving_spouse"
    );
  }

  const taxpayer = (answers.taxpayer_detail as AnyRecord) || {};
  const priorFiling = (answers.prior_filing as AnyRecord) || {};
  const spouse = (answers.spouse as AnyRecord) || {};
  const dependents = getArray<AnyRecord>(answers, ["dependents"]);
  const states = getArray<string>(answers, ["states_lived_worked"]);

  const schoolDistrictRelevant = states.some((s) => STATES_WITH_LOCAL_TAX_RELEVANCE.has(s));
  const schoolDistrictStatus = getStr(taxpayer, ["school_district_status"]);

  const nameChangeWho = getStr(marriage, ["name_change_who"]);
  const maritalSituation = getStr(marriage, ["marital_situation"]);
  const extensionFiled = getStr(priorFiling, ["extension_filed"]);

  return (
    <div className="space-y-4">
      <SubHeading title="About you" />
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField label="Date of birth *" type="date" value={getStr(taxpayer, ["dob"])} onChange={(v) => setAnswer(["taxpayer_detail", "dob"], v)} />
          <TextField label="Occupation" value={getStr(taxpayer, ["occupation"])} onChange={(v) => setAnswer(["taxpayer_detail", "occupation"], v)} />
          <TextField label="Current address" value={getStr(taxpayer, ["current_address"])} onChange={(v) => setAnswer(["taxpayer_detail", "current_address"], v)} />
          <TextField label="Prior-year address (if moved)" value={getStr(taxpayer, ["prior_address"])} onChange={(v) => setAnswer(["taxpayer_detail", "prior_address"], v)} />
        </div>

        <div className="mt-2 divide-y divide-line">
          {filingStatus !== "married_filing_jointly" && (
            <>
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
            </>
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
          <YesNo label="Have been a victim of tax-related identity theft" value={getBool(taxpayer, ["identity_theft"])} onChange={(v) => setAnswer(["taxpayer_detail", "identity_theft"], v)} />
          <YesNo label="Passed away during the tax year" value={getBool(taxpayer, ["deceased"])} onChange={(v) => setAnswer(["taxpayer_detail", "deceased"], v)} />
          {getBool(taxpayer, ["deceased"]) && (
            <div className="py-2">
              <TextField label="Date of death" type="date" value={getStr(taxpayer, ["date_of_death"])} onChange={(v) => setAnswer(["taxpayer_detail", "date_of_death"], v)} />
            </div>
          )}
        </div>
      </Card>

      <SubHeading title="Secure identity information" />
      <Card>
        <p className="text-xs text-muted mb-2">
          Your Social Security number, ITIN, or IP PIN is encrypted and only ever visible to authorized staff for a
          documented reason -- it&apos;s never shown back to you after saving, and it&apos;s stored separately from
          the rest of your answers.
        </p>
        <SecureIdentityField token={token} personType="taxpayer" personRef={null} personLabel="Your" kind="tax_id" required />
        <div className="mt-2">
          <SecureIdentityField token={token} personType="taxpayer" personRef={null} personLabel="Your" kind="ip_pin" />
        </div>
      </Card>

      <SubHeading title="Filing status" />
      <Card>
        <Select label="Expected filing status" value={filingStatus} onChange={handleFilingStatusChange} options={FILING_STATUSES} />

        {filingStatus === "married_filing_jointly" && (
          <div className="mt-2">
            <Select
              label="Did you or your spouse use a different legal name during the tax year or on a prior tax return?"
              value={nameChangeWho}
              onChange={(v) => setAnswer(["marriage", "name_change_who"], v)}
              options={[
                ["", "Select…"],
                ["taxpayer", "Taxpayer"],
                ["spouse", "Spouse"],
                ["both", "Both"],
                ["no", "No"],
              ]}
            />
            {(nameChangeWho === "taxpayer" || nameChangeWho === "both") && (
              <NameChangeSubform
                title="Taxpayer name change"
                data={(marriage.taxpayer_name_change as AnyRecord) || {}}
                onChange={(key, value) => setAnswer(["marriage", "taxpayer_name_change", key], value)}
              />
            )}
            {(nameChangeWho === "spouse" || nameChangeWho === "both") && (
              <NameChangeSubform
                title="Spouse name change"
                data={(marriage.spouse_name_change as AnyRecord) || {}}
                onChange={(key, value) => setAnswer(["marriage", "spouse_name_change", key], value)}
              />
            )}

            <div className="mt-2 divide-y divide-line">
              <YesNo
                label="Is this your first year filing jointly with this spouse?"
                value={getBool(marriage, ["first_year_filing_jointly"])}
                onChange={(v) => setAnswer(["marriage", "first_year_filing_jointly"], v)}
              />
              {getBool(marriage, ["first_year_filing_jointly"]) && (
                <div className="py-2">
                  <TextField label="Date married" type="date" value={getStr(marriage, ["date_married"])} onChange={(v) => setAnswer(["marriage", "date_married"], v)} />
                </div>
              )}
              <YesNo
                label="Did either spouse live in a different state during the year?"
                value={getBool(marriage, ["lived_different_states"])}
                onChange={(v) => setAnswer(["marriage", "lived_different_states"], v)}
              />
            </div>
          </div>
        )}

        {filingStatus === "married_filing_separately" && (
          <>
            <div className="mt-2">
              <Select
                label="What was your marital situation on December 31 of the tax year?"
                value={maritalSituation}
                onChange={(v) => setAnswer(["marriage", "marital_situation"], v)}
                options={MARITAL_SITUATION_OPTIONS}
              />
            </div>

            {maritalSituation === "married_living_apart" && (
              <div className="mt-2 divide-y divide-line">
                <YesNo
                  label="Did your spouse live in your home at any time during the final six months of the year?"
                  value={getBool(marriage, ["spouse_lived_home_last_six_months"])}
                  onChange={(v) => setAnswer(["marriage", "spouse_lived_home_last_six_months"], v)}
                />
                <div className="py-2">
                  <TextField label="Date living apart began" type="date" value={getStr(marriage, ["date_separated"])} onChange={(v) => setAnswer(["marriage", "date_separated"], v)} />
                </div>
                <YesNo
                  label="Was there a written separation agreement?"
                  value={getBool(marriage, ["written_separation_agreement"])}
                  onChange={(v) => setAnswer(["marriage", "written_separation_agreement"], v)}
                />
                <YesNo
                  label="Did you pay more than half the cost of maintaining your home?"
                  value={getBool(marriage, ["paid_more_than_half_home_costs"])}
                  onChange={(v) => setAnswer(["marriage", "paid_more_than_half_home_costs"], v)}
                />
                <YesNo
                  label="Did a qualifying child live with you for more than half the year?"
                  value={getBool(marriage, ["qualifying_child_lived_with_you"])}
                  onChange={(v) => setAnswer(["marriage", "qualifying_child_lived_with_you"], v)}
                />
              </div>
            )}

            {(maritalSituation === "separated_decree" || maritalSituation === "divorced_decree") && (
              <div className="mt-2 divide-y divide-line">
                <div className="py-2">
                  <TextField label="Date decree became final" type="date" value={getStr(marriage, ["decree_final_date"])} onChange={(v) => setAnswer(["marriage", "decree_final_date"], v)} />
                </div>
                <YesNo
                  label="Did you remarry before December 31?"
                  value={getBool(marriage, ["remarried_before_dec31"])}
                  onChange={(v) => setAnswer(["marriage", "remarried_before_dec31"], v)}
                />
              </div>
            )}

            <div className="mt-2 divide-y divide-line">
              <YesNo
                label="Did your spouse itemize deductions?"
                value={getBool(marriage, ["spouse_itemizes"])}
                onChange={(v) => setAnswer(["marriage", "spouse_itemizes"], v)}
              />
              <YesNo
                label="Do you have access to your spouse's income information?"
                value={getBool(marriage, ["access_to_spouse_income"])}
                onChange={(v) => setAnswer(["marriage", "access_to_spouse_income"], v)}
              />
              <YesNo
                label="Did either spouse live in a community-property state?"
                value={getBool(marriage, ["community_property"])}
                onChange={(v) => setAnswer(["marriage", "community_property"], v)}
              />
              <YesNo
                label="Did you have community income?"
                value={getBool(marriage, ["community_income"])}
                onChange={(v) => setAnswer(["marriage", "community_income"], v)}
              />
            </div>
            <div className="mt-2">
              <DisclaimerNote>
                Married Filing Separately often results in reduced credits and a higher combined
                tax than filing jointly. Your preparer will confirm which option is best once both
                returns are reviewed.
              </DisclaimerNote>
            </div>
          </>
        )}

        {filingStatus === "head_of_household" && (
          <div className="mt-2 divide-y divide-line">
            <YesNo
              label="Were you married on December 31?"
              value={getBool(marriage, ["hoh_married_dec31"])}
              onChange={(v) => setAnswer(["marriage", "hoh_married_dec31"], v)}
            />
            {getBool(marriage, ["hoh_married_dec31"]) && (
              <div className="py-2">
                <Select
                  label="If you were married at year-end, did your spouse live outside your home for the entire last six months of the tax year?"
                  value={getStr(marriage, ["hoh_spouse_lived_outside_six_months"])}
                  onChange={(v) => setAnswer(["marriage", "hoh_spouse_lived_outside_six_months"], v)}
                  options={[
                    ["", "Select…"],
                    ["yes", "Yes"],
                    ["no", "No"],
                    ["unsure", "Unsure"],
                  ]}
                />
              </div>
            )}
            <YesNo
              label="Did you pay more than half the cost of maintaining your home for the year?"
              value={getBool(marriage, ["hoh_paid_more_than_half_costs"])}
              onChange={(v) => setAnswer(["marriage", "hoh_paid_more_than_half_costs"], v)}
            />
            <YesNo
              label="Did a qualifying person live with you for more than half the year?"
              value={getBool(marriage, ["hoh_qualifying_person_lived_with_you"])}
              onChange={(v) => setAnswer(["marriage", "hoh_qualifying_person_lived_with_you"], v)}
            />
            <YesNo
              label="Is another person expected to claim that qualifying person?"
              value={getBool(marriage, ["hoh_another_may_claim"])}
              onChange={(v) => setAnswer(["marriage", "hoh_another_may_claim"], v)}
            />
            <div className="py-2">
              <DisclaimerNote>
                Your preparer will also review who paid the household costs and whether a
                qualifying person lived with you before confirming Head of Household status.
              </DisclaimerNote>
            </div>
          </div>
        )}

        {filingStatus === "single" && (
          <div className="mt-2 divide-y divide-line">
            <YesNo
              label="Were you divorced or legally separated under a final decree by December 31?"
              value={getBool(marriage, ["divorced_or_separated_by_dec31"])}
              onChange={(v) => setAnswer(["marriage", "divorced_or_separated_by_dec31"], v)}
            />
            {getBool(marriage, ["divorced_or_separated_by_dec31"]) && (
              <div className="py-2">
                <TextField
                  label="Date of divorce or legal separation"
                  type="date"
                  value={getStr(marriage, ["date_divorced"])}
                  onChange={(v) => setAnswer(["marriage", "date_divorced"], v)}
                />
              </div>
            )}
            <YesNo
              label="Did you become widowed during the year?"
              value={getBool(marriage, ["widowed_this_year"])}
              onChange={(v) => setAnswer(["marriage", "widowed_this_year"], v)}
            />
            {getBool(marriage, ["widowed_this_year"]) && (
              <div className="py-2">
                <TextField
                  label="Date of spouse's death"
                  type="date"
                  value={getStr(marriage, ["date_of_widowhood"])}
                  onChange={(v) => setAnswer(["marriage", "date_of_widowhood"], v)}
                />
              </div>
            )}
          </div>
        )}

        {filingStatus === "qualifying_surviving_spouse" && (
          <div className="mt-2 divide-y divide-line">
            <YesNo
              label="Do you have a qualifying child who lived with you the entire year?"
              value={getBool(marriage, ["qss_qualifying_child"])}
              onChange={(v) => setAnswer(["marriage", "qss_qualifying_child"], v)}
            />
            <YesNo
              label="Did you pay more than half the cost of keeping up the home?"
              value={getBool(marriage, ["qss_paid_more_than_half_costs"])}
              onChange={(v) => setAnswer(["marriage", "qss_paid_more_than_half_costs"], v)}
            />
          </div>
        )}
      </Card>

      {showSpouse && (
        <SpouseSection spouse={spouse} onChange={(key, value) => setAnswer(["spouse", key], value)} token={token} filingStatus={filingStatus} />
      )}

      <DependentsSection dependents={dependents} onChange={(next) => setAnswer(["dependents"], next)} token={token} taxYear={taxYear} />

      <SubHeading title="Household" />
      <Card>
        <TemporaryAbsences answers={answers} setAnswer={setAnswer} />
      </Card>

      <SubHeading title="Prior filing" />
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Prior-year filing status"
            value={getStr(priorFiling, ["prior_status"])}
            onChange={(v) => setAnswer(["prior_filing", "prior_status"], v)}
            options={PRIOR_FILING_STATUSES}
          />
          <TextField label="Prior preparer (if any)" value={getStr(priorFiling, ["prior_preparer"])} onChange={(v) => setAnswer(["prior_filing", "prior_preparer"], v)} />
        </div>
        <div className="mt-2 divide-y divide-line">
          <YesNo label="I have a copy of my prior-year tax return" value={getBool(answers, ["has_prior_year_return"])} onChange={(v) => setAnswer(["has_prior_year_return"], v)} />
        </div>
        <div className="mt-2">
          <Select
            label={`Was an extension filed for the ${taxYear} tax year covered by this intake?`}
            value={extensionFiled}
            onChange={(v) => setAnswer(["prior_filing", "extension_filed"], v)}
            options={[
              ["", "Select…"],
              ["yes", "Yes"],
              ["no", "No"],
              ["unsure", "Unsure"],
            ]}
          />
        </div>
        <p className="text-xs text-muted mt-2">
          If you have an unresolved extension or filing issue for a different year, that&apos;s covered separately
          under Tax Problems in Major Changes and Special Tax Situations.
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
