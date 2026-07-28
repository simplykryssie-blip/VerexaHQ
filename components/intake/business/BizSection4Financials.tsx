"use client";

import { Card, SectionHeading, SubHeading, Select } from "../fields";
import { getStr, type AnyRecord } from "@/lib/intakeAnswers";
import { AVAILABILITY_OPTIONS, BOOKKEEPING_STATUS_OPTIONS } from "@/lib/businessIntakeOptions";

const RECORD_ITEMS: [string, string][] = [
  ["pl_statement", "Profit and loss statement"],
  ["balance_sheet", "Balance sheet"],
  ["bank_statements", "Bank statements for the year"],
  ["trial_balance", "Trial balance"],
  ["general_ledger", "General ledger"],
  ["credit_card_statements", "Business credit card statements"],
  ["loan_statements", "Loan statements"],
  ["fixed_asset_schedule", "Fixed-asset / depreciation schedule"],
  ["inventory_records", "Inventory records"],
];

export function BizSection4Financials({
  answers,
  setAnswer,
}: {
  answers: AnyRecord;
  setAnswer: (path: string[], value: unknown) => void;
}) {
  const bookkeeping = (answers.bookkeeping as AnyRecord) || {};
  const financialRecords = (answers.financial_records as AnyRecord) || {};

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Financial Records, Income & Expenses"
        hint="This tells us what we already have to work with, not the numbers themselves — you'll upload the actual documents in a later step."
      />

      <Card>
        <Select
          label="How would you describe the business's bookkeeping for this year?"
          value={getStr(bookkeeping, ["status"])}
          onChange={(v) => setAnswer(["bookkeeping", "status"], v)}
          options={BOOKKEEPING_STATUS_OPTIONS}
        />
      </Card>

      <Card>
        <SubHeading title="Which of these do you have available?" />
        <div className="space-y-3 mt-2">
          {RECORD_ITEMS.map(([key, label]) => (
            <Select
              key={key}
              label={label}
              value={getStr(financialRecords, [key])}
              onChange={(v) => setAnswer(["financial_records", key], v)}
              options={AVAILABILITY_OPTIONS}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
