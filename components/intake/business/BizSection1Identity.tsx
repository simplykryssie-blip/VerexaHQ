"use client";

import { Card, SectionHeading, SubHeading, TextField, Select, YesNo, BlankableNumberField } from "../fields";
import { SecureIdentityField } from "../SecureIdentityField";
import { getStr, getBool, type AnyRecord } from "@/lib/intakeAnswers";
import { RETURN_TYPE_DETAIL_OPTIONS } from "@/lib/businessIntakeOptions";
import { ENTITY_CLASSIFICATION_LABELS } from "@/lib/businessIntakeOptions";
import type { IntakeRow } from "@/lib/supabaseIntake";

export function BizSection1Identity({
  token,
  intake,
  answers,
  setAnswer,
}: {
  token: string;
  intake: IntakeRow;
  answers: AnyRecord;
  setAnswer: (path: string[], value: unknown) => void;
}) {
  const entity = (answers.entity as AnyRecord) || {};
  const elections = (answers.elections as AnyRecord) || {};
  const filingHistory = (answers.filing_history as AnyRecord) || {};
  const classification = intake.entity_classification || "";
  const needsSElection = classification === "s_corp" || classification === "llc_s_corp";
  const needs8832 = classification === "llc_c_corp" || classification === "llc_s_corp";

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Business Identity & Tax Classification"
        hint="A few details to confirm the business and how it's taxed."
      />

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="min-w-0">
            <div className="text-xs text-muted">Legal business name</div>
            <div className="text-ink font-medium break-words">{intake.legal_business_name || "—"}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted">Tax classification</div>
            <div className="text-ink font-medium break-words">{ENTITY_CLASSIFICATION_LABELS[classification] || "—"}</div>
          </div>
        </div>
        <p className="text-xs text-muted mt-2">
          These were set when you started this intake. Contact us if either needs to change.
        </p>
      </Card>

      <Card>
        <TextField
          label="Doing-business-as (DBA) name, if any"
          value={getStr(entity, ["dba_name"])}
          onChange={(v) => setAnswer(["entity", "dba_name"], v)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <TextField
            label="State of formation"
            value={getStr(entity, ["formation_state"])}
            onChange={(v) => setAnswer(["entity", "formation_state"], v)}
          />
          <BlankableNumberField
            label="Year formed"
            value={(entity.formation_year as number) ?? null}
            onChange={(v) => setAnswer(["entity", "formation_year"], v)}
            min={1900}
          />
        </div>
      </Card>

      <Card>
        <SecureIdentityField token={token} personType="business" personRef={null} personLabel="Business" kind="business_ein" required />
      </Card>

      <Card>
        <Select
          label="Tax year type"
          value={getStr(entity, ["tax_year_type"])}
          onChange={(v) => setAnswer(["entity", "tax_year_type"], v)}
          options={[
            ["", "Select…"],
            ["calendar", "Calendar year (ends December 31)"],
            ["fiscal", "Fiscal year (ends a different month)"],
          ]}
        />
        <div className="mt-3">
          <Select
            label="What kind of return is this?"
            value={getStr(answers, ["return_type_detail"])}
            onChange={(v) => setAnswer(["return_type_detail"], v)}
            options={RETURN_TYPE_DETAIL_OPTIONS}
          />
        </div>
      </Card>

      {needsSElection && (
        <Card>
          <SubHeading title="S corporation election" />
          <YesNo
            label="Was Form 2553 (S-election) filed for this business?"
            value={getBool(elections, ["form_2553_filed"])}
            onChange={(v) => setAnswer(["elections", "form_2553_filed"], v)}
          />
          {getBool(elections, ["form_2553_filed"]) && (
            <YesNo
              label="Do you have the IRS acceptance letter for the S-election?"
              value={getBool(elections, ["acceptance_letter_available"])}
              onChange={(v) => setAnswer(["elections", "acceptance_letter_available"], v)}
            />
          )}
        </Card>
      )}

      {needs8832 && (
        <Card>
          <SubHeading title="Entity classification election" />
          <YesNo
            label="Was Form 8832 (entity classification election) filed for this LLC?"
            value={getBool(elections, ["form_8832_filed"])}
            onChange={(v) => setAnswer(["elections", "form_8832_filed"], v)}
          />
          {getBool(elections, ["form_8832_filed"]) && (
            <YesNo
              label="Do you have the IRS approval letter for that election?"
              value={getBool(elections, ["acceptance_letter_available_8832"])}
              onChange={(v) => setAnswer(["elections", "acceptance_letter_available_8832"], v)}
            />
          )}
        </Card>
      )}

      <Card>
        <SubHeading title="Filing history" />
        <YesNo
          label="Did the business file a tax return last year?"
          value={getBool(filingHistory, ["prior_return_filed"])}
          onChange={(v) => setAnswer(["filing_history", "prior_return_filed"], v)}
        />
        {getBool(filingHistory, ["prior_return_filed"]) && (
          <YesNo
            label="Do you have a copy of last year's return?"
            value={getBool(filingHistory, ["prior_copy_available"])}
            onChange={(v) => setAnswer(["filing_history", "prior_copy_available"], v)}
          />
        )}
        <YesNo
          label="Are there any prior years that still need to be filed?"
          value={getBool(filingHistory, ["unfiled_years"])}
          onChange={(v) => setAnswer(["filing_history", "unfiled_years"], v)}
        />
        <YesNo
          label="Has the business received any notice from the IRS or a state tax agency?"
          value={getBool(filingHistory, ["irs_state_notice"])}
          onChange={(v) => setAnswer(["filing_history", "irs_state_notice"], v)}
        />
        <YesNo
          label="Was an extension filed for the tax year covered by this intake?"
          value={getStr(filingHistory, ["extension_filed"]) === "yes"}
          onChange={(v) => setAnswer(["filing_history", "extension_filed"], v ? "yes" : "no")}
        />
      </Card>
    </div>
  );
}
