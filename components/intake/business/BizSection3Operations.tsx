"use client";

import { Card, SectionHeading, SubHeading, TextArea, YesNo, YesNoUnsure, DisclaimerNote } from "../fields";
import { StatesMultiSelect } from "../StatesMultiSelect";
import { getArray, getStr, getBool, type AnyRecord } from "@/lib/intakeAnswers";

const STATE_ACTIVITY_KEYS = [
  ["offices_other_states", "Does the business have any offices or physical locations outside its home state?"],
  ["employees_other_states", "Does the business have employees working in other states?"],
  ["property_inventory_other_states", "Does the business have property or inventory in other states?"],
  ["registered_other_states", "Is the business registered to do business in any other state?"],
  ["prior_state_returns", "Has the business filed a state return in another state before?"],
  ["services_performed_other_states", "Are services performed for customers in other states?"],
  ["marketplace_online_sales", "Does the business sell through an online marketplace or make online sales?"],
  ["payroll_other_states", "Does the business run payroll in any other state?"],
  ["sales_tax_registrations", "Is the business registered to collect sales tax in any state?"],
] as const;

export function BizSection3Operations({
  answers,
  setAnswer,
}: {
  answers: AnyRecord;
  setAnswer: (path: string[], value: unknown) => void;
}) {
  const operations = (answers.operations as AnyRecord) || {};
  const stateActivity = (answers.state_activity as AnyRecord) || {};
  const foreignActivity = (answers.foreign_activity as AnyRecord) || {};
  const foreignCategories = (foreignActivity.categories as AnyRecord) || {};
  const states = getArray<string>(answers, ["states_lived_worked"]);

  const anyStateActivity = STATE_ACTIVITY_KEYS.some(([key]) => getBool(stateActivity, [key]));
  const hasForeign = getStr(foreignActivity, ["has_foreign_activity"]) === "yes";
  const anyForeignCategory = Object.values(foreignCategories).some((v) => v === true);

  return (
    <div className="space-y-4">
      <SectionHeading title="Business Operations & Locations" hint="Where and how the business operates." />

      <Card>
        <TextArea
          label="Briefly describe what the business does"
          value={getStr(operations, ["business_description"])}
          onChange={(v) => setAnswer(["operations", "business_description"], v)}
        />
      </Card>

      <Card>
        <SubHeading title="Activity outside the business's home state" />
        <div className="space-y-1 mt-1">
          {STATE_ACTIVITY_KEYS.map(([key, label]) => (
            <YesNo
              key={key}
              label={label}
              value={getBool(stateActivity, [key])}
              onChange={(v) => setAnswer(["state_activity", key], v)}
            />
          ))}
          {getBool(stateActivity, ["marketplace_online_sales"]) && (
            <div className="pt-2 mt-1 border-t border-line">
              <YesNoUnsure
                label="Do you have a report showing sales by state?"
                value={getStr(stateActivity, ["sales_by_state_report_available"]) as "yes" | "no" | "unsure" | ""}
                onChange={(v) => setAnswer(["state_activity", "sales_by_state_report_available"], v)}
              />
            </div>
          )}
          <div className="pt-2 mt-1 border-t border-line">
            <YesNo
              label="I'm not sure whether the business has any out-of-state activity"
              value={getBool(stateActivity, ["unsure"])}
              onChange={(v) => setAnswer(["state_activity", "unsure"], v)}
            />
          </div>
        </div>

        {anyStateActivity && (
          <div className="mt-3 pt-3 border-t border-line">
            <StatesMultiSelect
              value={states}
              onChange={(codes) => setAnswer(["states_lived_worked"], codes)}
              label="Which state(s)?"
            />
          </div>
        )}
      </Card>

      <Card>
        <SubHeading title="Foreign activity" />
        <YesNoUnsure
          label="Does the business have any foreign owners, accounts, income, property, or transactions?"
          value={getStr(foreignActivity, ["has_foreign_activity"]) as "yes" | "no" | "unsure" | ""}
          onChange={(v) => setAnswer(["foreign_activity", "has_foreign_activity"], v)}
        />
        {hasForeign && (
          <div className="space-y-1 mt-2 pt-2 border-t border-line">
            <YesNo label="Foreign owner(s)" value={getBool(foreignCategories, ["foreign_owners"])} onChange={(v) => setAnswer(["foreign_activity", "categories", "foreign_owners"], v)} />
            <YesNo label="Foreign bank or financial account(s)" value={getBool(foreignCategories, ["foreign_accounts"])} onChange={(v) => setAnswer(["foreign_activity", "categories", "foreign_accounts"], v)} />
            <YesNo label="Foreign income" value={getBool(foreignCategories, ["foreign_income"])} onChange={(v) => setAnswer(["foreign_activity", "categories", "foreign_income"], v)} />
            <YesNo label="Foreign property" value={getBool(foreignCategories, ["foreign_property"])} onChange={(v) => setAnswer(["foreign_activity", "categories", "foreign_property"], v)} />
            <YesNo label="A foreign subsidiary or foreign disregarded entity" value={getBool(foreignCategories, ["foreign_subsidiary"])} onChange={(v) => setAnswer(["foreign_activity", "categories", "foreign_subsidiary"], v)} />
            <YesNo label="A foreign related party" value={getBool(foreignCategories, ["foreign_related_party"])} onChange={(v) => setAnswer(["foreign_activity", "categories", "foreign_related_party"], v)} />
            <YesNo label="Foreign loans" value={getBool(foreignCategories, ["foreign_loans"])} onChange={(v) => setAnswer(["foreign_activity", "categories", "foreign_loans"], v)} />
            <YesNo label="Other foreign transactions" value={getBool(foreignCategories, ["foreign_transactions"])} onChange={(v) => setAnswer(["foreign_activity", "categories", "foreign_transactions"], v)} />
            {!anyForeignCategory && (
              <DisclaimerNote>Please select at least one category so our team knows what to review.</DisclaimerNote>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
