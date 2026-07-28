"use client";

import { Card, SectionHeading, SubHeading, Select, YesNo, YesNoUnsure } from "../fields";
import { getStr, getBool, type AnyRecord } from "@/lib/intakeAnswers";
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
];

const INCOME_SOURCE_ITEMS: [string, string][] = [
  ["rental_real_estate", "Rental real estate income"],
  ["portfolio_investment", "Interest, dividends, or investment income"],
  ["marketplace_platform_income", "Income reported through an online marketplace or payment platform (e.g. a 1099-K)"],
  ["cash_income", "Cash income that may not be fully reflected in the bank records"],
  ["debt_cancellation", "A debt owed by the business was forgiven or cancelled"],
  ["grants_received", "Grants received"],
  ["insurance_proceeds", "Insurance proceeds received"],
];

const DEDUCTION_SCREEN_ITEMS: [string, string][] = [
  ["retirement_plan_contributions", "Retirement plan contributions for employees or the owner(s)"],
  ["employee_benefit_programs", "Employee benefit programs (e.g. health insurance)"],
  ["owner_paid_business_expenses", "An owner paid business expenses personally and needs reimbursement"],
  ["business_expenses_paid_personally", "Business funds were used to pay for personal expenses"],
  ["home_office_or_owner_reimbursement", "The business uses a home office, or reimburses an owner for home-office expenses"],
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
  const incomeSources = (answers.income_sources as AnyRecord) || {};
  const deductionsScreening = (answers.deductions_screening as AnyRecord) || {};
  const inventory = (answers.inventory as AnyRecord) || {};
  const carriesInventory = getBool(inventory, ["carries_inventory"]);

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Financial Records, Income & Expenses"
        hint="This tells us what applies and what we already have to work with — you'll upload the actual documents in a later step, not retype every transaction here."
      />

      <Card>
        <Select
          label="How would you describe the business's bookkeeping for this year?"
          value={getStr(bookkeeping, ["status"])}
          onChange={(v) => setAnswer(["bookkeeping", "status"], v)}
          options={BOOKKEEPING_STATUS_OPTIONS}
        />
        <div className="mt-2">
          <YesNoUnsure
            label="Are the business bank accounts reconciled through year-end?"
            value={getStr(bookkeeping, ["bank_reconciled"]) as "yes" | "no" | "unsure" | ""}
            onChange={(v) => setAnswer(["bookkeeping", "bank_reconciled"], v)}
          />
        </div>
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

      <Card>
        <SubHeading title="Inventory" />
        <YesNo
          label="Does the business carry inventory?"
          value={carriesInventory}
          onChange={(v) => setAnswer(["inventory", "carries_inventory"], v)}
        />
        {carriesInventory && (
          <div className="space-y-3 mt-2 pt-2 border-t border-line">
            <Select
              label="Inventory valuation method"
              value={getStr(inventory, ["method"])}
              onChange={(v) => setAnswer(["inventory", "method"], v)}
              options={[
                ["", "Select…"],
                ["cost", "Cost"],
                ["lower_of_cost_or_market", "Lower of cost or market"],
                ["other", "Other"],
                ["unsure", "I'm not sure"],
              ]}
            />
            <Select
              label="Do you have beginning and ending inventory records?"
              value={getStr(inventory, ["records_available"])}
              onChange={(v) => setAnswer(["inventory", "records_available"], v)}
              options={AVAILABILITY_OPTIONS}
            />
            <YesNo
              label="Was a physical inventory count done this year?"
              value={getBool(inventory, ["physical_count_done"])}
              onChange={(v) => setAnswer(["inventory", "physical_count_done"], v)}
            />
            <YesNo
              label="Does the inventory include obsolete or damaged items?"
              value={getBool(inventory, ["has_obsolete_damaged"])}
              onChange={(v) => setAnswer(["inventory", "has_obsolete_damaged"], v)}
            />
          </div>
        )}
      </Card>

      <Card>
        <SubHeading title="Other income to be aware of" />
        <p className="text-xs text-muted mb-1">Did the business have any of the following this year?</p>
        <div className="space-y-1">
          {INCOME_SOURCE_ITEMS.map(([key, label]) => (
            <YesNo key={key} label={label} value={getBool(incomeSources, [key])} onChange={(v) => setAnswer(["income_sources", key], v)} />
          ))}
        </div>
      </Card>

      <Card>
        <SubHeading title="Other deductions to be aware of" />
        <p className="text-xs text-muted mb-1">
          Ordinary expenses will come from your profit and loss statement. These specific items
          often need separate handling:
        </p>
        <div className="space-y-1">
          {DEDUCTION_SCREEN_ITEMS.map(([key, label]) => (
            <YesNo key={key} label={label} value={getBool(deductionsScreening, [key])} onChange={(v) => setAnswer(["deductions_screening", key], v)} />
          ))}
        </div>
      </Card>
    </div>
  );
}
