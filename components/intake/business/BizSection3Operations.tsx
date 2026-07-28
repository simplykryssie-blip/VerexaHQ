"use client";

import { Card, SectionHeading, TextField, YesNo, BlankableNumberField, TextArea } from "../fields";
import { StatesMultiSelect } from "../StatesMultiSelect";
import { getArray, getStr, getBool, type AnyRecord } from "@/lib/intakeAnswers";

export function BizSection3Operations({
  answers,
  setAnswer,
}: {
  answers: AnyRecord;
  setAnswer: (path: string[], value: unknown) => void;
}) {
  const operations = (answers.operations as AnyRecord) || {};
  const states = getArray<string>(answers, ["states_lived_worked"]);

  return (
    <div className="space-y-4">
      <SectionHeading title="Business Operations & Locations" hint="Where and how the business operates." />

      <Card>
        <TextArea
          label="Briefly describe what the business does"
          value={getStr(operations, ["business_description"])}
          onChange={(v) => setAnswer(["operations", "business_description"], v)}
        />
        <div className="mt-3">
          <TextField
            label="Principal business address"
            value={getStr(operations, ["principal_address"])}
            onChange={(v) => setAnswer(["operations", "principal_address"], v)}
          />
        </div>
        <div className="mt-3">
          <BlankableNumberField
            label="Number of business locations"
            value={(operations.location_count as number) ?? null}
            onChange={(v) => setAnswer(["operations", "location_count"], v)}
            min={1}
          />
        </div>
      </Card>

      <Card>
        <StatesMultiSelect
          value={states}
          onChange={(codes) => setAnswer(["states_lived_worked"], codes)}
          label="State(s) the business operates or has employees/customers in"
        />
      </Card>

      <Card>
        <YesNo
          label="Does the business have any foreign operations, foreign bank accounts, or foreign ownership?"
          value={getBool(operations, ["foreign_activity"])}
          onChange={(v) => setAnswer(["operations", "foreign_activity"], v)}
        />
      </Card>
    </div>
  );
}
