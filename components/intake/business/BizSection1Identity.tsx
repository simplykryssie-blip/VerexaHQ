"use client";

import { Card, SectionHeading, SubHeading, TextField, Select, YesNo, YesNoUnsure, DateField, BlankableNumberField, DisclaimerNote } from "../fields";
import { SecureIdentityField } from "../SecureIdentityField";
import { getStr, getBool, type AnyRecord } from "@/lib/intakeAnswers";
import { ENTITY_CLASSIFICATION_LABELS } from "@/lib/businessIntakeOptions";
import type { IntakeRow } from "@/lib/supabaseIntake";

const S_CORP_TAXED = new Set(["s_corp", "smllc_s_corp", "mmllc_s_corp"]);
const C_CORP_TAXED_LLC = new Set(["smllc_c_corp", "mmllc_c_corp"]);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type YNU = "yes" | "no" | "unsure" | "";

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
  const returnStatus = (answers.return_status as AnyRecord) || {};
  const address = (answers.address as AnyRecord) || {};
  const principal = (address.principal as AnyRecord) || {};
  const mailing = (address.mailing as AnyRecord) || {};
  const classification = intake.entity_classification || "";
  const needsSElection = S_CORP_TAXED.has(classification);
  const needs8832 = C_CORP_TAXED_LLC.has(classification);

  const already_filed = getStr(returnStatus, ["already_filed"]) as YNU;
  const is_initial = getStr(returnStatus, ["is_initial"]) as YNU;
  const is_final = getStr(returnStatus, ["is_final"]) as YNU;
  const is_short_period = getStr(returnStatus, ["is_short_period"]) as YNU;
  const mailingSame = address.mailing_same_as_principal !== false;

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
          <DateField
            label="Date the business was formed"
            value={getStr(entity, ["date_formed"])}
            onChange={(v) => setAnswer(["entity", "date_formed"], v)}
            max={todayISO()}
          />
        </div>
        <div className="mt-3">
          <DateField
            label="Date the business began operating (if different from the formation date)"
            value={getStr(entity, ["operations_began_date"])}
            onChange={(v) => setAnswer(["entity", "operations_began_date"], v)}
            max={todayISO()}
          />
        </div>
      </Card>

      <Card>
        <SecureIdentityField token={token} personType="business" personRef={null} personLabel="Business" kind="business_ein" required />
      </Card>

      <Card>
        <Select
          label="What accounting year does the business use for its federal tax return?"
          value={getStr(entity, ["tax_year_type"])}
          onChange={(v) => setAnswer(["entity", "tax_year_type"], v)}
          options={[
            ["", "Select…"],
            ["calendar", "Calendar year ending December 31"],
            ["fiscal", "Fiscal year ending on another date"],
            ["unsure", "I'm not sure"],
          ]}
        />
        {getStr(entity, ["tax_year_type"]) === "fiscal" && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Select
              label="Fiscal year ends in month"
              value={getStr(entity, ["fiscal_year_end_month"])}
              onChange={(v) => setAnswer(["entity", "fiscal_year_end_month"], v)}
              options={[
                ["", "Select…"],
                ...Array.from({ length: 12 }, (_, i) => [String(i + 1), new Date(2000, i, 1).toLocaleString("en-US", { month: "long" })] as [string, string]),
              ]}
            />
            <BlankableNumberField
              label="On day"
              value={(entity.fiscal_year_end_day as number) ?? null}
              onChange={(v) => setAnswer(["entity", "fiscal_year_end_day"], v)}
              min={1}
            />
          </div>
        )}
        <div className="mt-3 space-y-1">
          <YesNo
            label="Has the business's legal name changed since its last return?"
            value={getBool(entity, ["business_name_changed"])}
            onChange={(v) => setAnswer(["entity", "business_name_changed"], v)}
          />
          <YesNo
            label="Has the business's address changed since its last return?"
            value={getBool(entity, ["address_changed"])}
            onChange={(v) => setAnswer(["entity", "address_changed"], v)}
          />
          <YesNo
            label="Did the business change its accounting period this year?"
            value={getBool(entity, ["accounting_period_changed"])}
            onChange={(v) => setAnswer(["entity", "accounting_period_changed"], v)}
          />
        </div>
      </Card>

      <Card>
        <SubHeading title="Principal business address" />
        <p className="text-xs text-muted mb-2">
          Enter the business&apos;s principal office or actual place of business. Don&apos;t use a
          registered agent&apos;s address unless the business actually operates there.
        </p>
        <div className="space-y-3">
          <TextField label="Street address" value={getStr(principal, ["street"])} onChange={(v) => setAnswer(["address", "principal", "street"], v)} />
          <TextField label="Suite, unit, or room" value={getStr(principal, ["unit"])} onChange={(v) => setAnswer(["address", "principal", "unit"], v)} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TextField label="City" value={getStr(principal, ["city"])} onChange={(v) => setAnswer(["address", "principal", "city"], v)} />
            <TextField label="State" value={getStr(principal, ["state"])} onChange={(v) => setAnswer(["address", "principal", "state"], v)} />
            <TextField label="ZIP code" value={getStr(principal, ["zip"])} onChange={(v) => setAnswer(["address", "principal", "zip"], v)} />
          </div>
          <TextField
            label="Country (leave blank if United States)"
            value={getStr(principal, ["country"])}
            onChange={(v) => setAnswer(["address", "principal", "country"], v)}
          />
          {getStr(principal, ["country"]) && getStr(principal, ["country"]).toUpperCase() !== "US" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField
                label="Foreign province or region"
                value={getStr(principal, ["foreign_province"])}
                onChange={(v) => setAnswer(["address", "principal", "foreign_province"], v)}
              />
              <TextField
                label="Foreign postal code"
                value={getStr(principal, ["foreign_postal_code"])}
                onChange={(v) => setAnswer(["address", "principal", "foreign_postal_code"], v)}
              />
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-line">
          <YesNo
            label="Is the mailing address the same as the principal business address?"
            value={mailingSame}
            onChange={(v) => setAnswer(["address", "mailing_same_as_principal"], v)}
          />
        </div>
        {!mailingSame && (
          <div className="space-y-3 mt-3">
            <TextField label="Mailing street address" value={getStr(mailing, ["street"])} onChange={(v) => setAnswer(["address", "mailing", "street"], v)} />
            <TextField label="Suite, unit, or room" value={getStr(mailing, ["unit"])} onChange={(v) => setAnswer(["address", "mailing", "unit"], v)} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <TextField label="City" value={getStr(mailing, ["city"])} onChange={(v) => setAnswer(["address", "mailing", "city"], v)} />
              <TextField label="State" value={getStr(mailing, ["state"])} onChange={(v) => setAnswer(["address", "mailing", "state"], v)} />
              <TextField label="ZIP code" value={getStr(mailing, ["zip"])} onChange={(v) => setAnswer(["address", "mailing", "zip"], v)} />
            </div>
            <TextField label="Country (leave blank if United States)" value={getStr(mailing, ["country"])} onChange={(v) => setAnswer(["address", "mailing", "country"], v)} />
          </div>
        )}
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

      <Card>
        <SubHeading title="This return" />
        <YesNoUnsure
          label="Has a federal business return already been filed for the tax year covered by this intake?"
          value={already_filed}
          onChange={(v) => setAnswer(["return_status", "already_filed"], v)}
        />
        {already_filed === "yes" && (
          <YesNoUnsure
            label="Does the previously filed return need to be corrected?"
            value={getStr(returnStatus, ["needs_amendment"]) as YNU}
            onChange={(v) => setAnswer(["return_status", "needs_amendment"], v)}
          />
        )}
        <YesNoUnsure
          label="Is this the business's first federal tax return?"
          value={is_initial}
          onChange={(v) => setAnswer(["return_status", "is_initial"], v)}
        />
        <YesNoUnsure
          label="Is this expected to be the business's final federal tax return?"
          value={is_final}
          onChange={(v) => setAnswer(["return_status", "is_final"], v)}
        />
        <YesNoUnsure
          label="Does this return cover fewer than 12 months?"
          value={is_short_period}
          onChange={(v) => setAnswer(["return_status", "is_short_period"], v)}
        />
        {is_short_period === "yes" && (
          <div className="space-y-3 mt-2 pt-2 border-t border-line">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DateField
                label="Period beginning date"
                value={getStr(returnStatus, ["short_period_begin"])}
                onChange={(v) => setAnswer(["return_status", "short_period_begin"], v)}
                max={todayISO()}
              />
              <DateField
                label="Period ending date"
                value={getStr(returnStatus, ["short_period_end"])}
                onChange={(v) => setAnswer(["return_status", "short_period_end"], v)}
                max={todayISO()}
              />
            </div>
            {is_initial !== "yes" && is_final !== "yes" && (
              <Select
                label="Why does this return cover fewer than 12 months?"
                value={getStr(returnStatus, ["short_period_reason"])}
                onChange={(v) => setAnswer(["return_status", "short_period_reason"], v)}
                options={[
                  ["", "Select…"],
                  ["accounting_period_change", "The business changed its accounting period"],
                  ["other", "Other reason"],
                  ["unsure", "I'm not sure"],
                ]}
              />
            )}
          </div>
        )}
        {(already_filed === "unsure" || is_initial === "unsure" || is_final === "unsure" || is_short_period === "unsure") && (
          <DisclaimerNote>
            That&apos;s okay — we&apos;ll confirm the return type with you before preparing anything.
          </DisclaimerNote>
        )}
      </Card>
    </div>
  );
}
