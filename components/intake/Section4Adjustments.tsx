"use client";

import { Card, SubHeading, Checkbox, DisclaimerNote, TextArea } from "./fields";
import { getBool, getStr, type AnyRecord } from "@/lib/intakeAnswers";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Income adjustments",
    items: [
      ["student_loan_interest", "Student loan interest paid"],
      ["educator_expenses", "Educator expenses"],
      ["ira_contributions", "IRA contributions"],
      ["hsa", "HSA contributions or distributions"],
      ["self_employed_health_insurance", "Self-employed health insurance"],
      ["self_employed_retirement", "Self-employed retirement plan"],
      ["alimony_paid", "Alimony paid"],
      ["moving_expenses_military", "Moving expenses (military)"],
    ],
  },
  {
    title: "Education",
    items: [
      ["tuition_education", "Tuition or education expenses"],
      ["scholarships_529", "529 plan activity"],
    ],
  },
  {
    title: "Family & medical",
    items: [
      ["dependent_care", "Childcare / dependent-care expenses"],
      ["adoption_expenses", "Adoption expenses"],
      ["medical_dental", "Medical and dental expenses"],
      ["health_premiums", "Health insurance premiums paid out of pocket"],
      ["marketplace_insurance", "Marketplace insurance (Form 1095-A)"],
    ],
  },
  {
    title: "Home & property",
    items: [
      ["mortgage_interest", "Mortgage interest"],
      ["property_taxes", "Property taxes"],
      ["real_estate_taxes", "Other real-estate taxes"],
      ["energy_efficient_home", "Energy-efficient home improvements"],
      ["clean_energy_credits", "Residential clean-energy credits (solar, etc.)"],
      ["ev_credits", "Electric vehicle credit"],
    ],
  },
  {
    title: "Giving & losses",
    items: [
      ["charitable_cash", "Charitable cash donations"],
      ["charitable_noncash", "Charitable non-cash donations"],
      ["casualty_loss", "Casualty or disaster loss"],
      ["gambling_losses", "Gambling losses"],
      ["investment_interest", "Investment interest expense"],
    ],
  },
  {
    title: "Taxes & payments",
    items: [
      ["salt_paid", "State and local income taxes paid"],
      ["sales_tax", "Sales tax (in lieu of income tax)"],
      ["estimated_tax_payments", "Estimated tax payments made"],
      ["extension_payments", "Extension payment made"],
      ["foreign_tax_paid", "Foreign tax paid"],
      ["prior_credit_carryovers", "Credit carryovers from a prior year"],
    ],
  },
];

export function Section4Adjustments({ answers, setAnswer }: { answers: AnyRecord; setAnswer: (path: string[], value: unknown) => void }) {
  const deductions = (answers.deductions as AnyRecord) || {};
  return (
    <div className="space-y-4">
      <DisclaimerNote>
        This information helps your preparer determine whether a deduction or credit may apply.
        Checking a box here doesn&apos;t mean you qualify -- your preparer will confirm eligibility
        when reviewing your return.
      </DisclaimerNote>
      {GROUPS.map((group) => (
        <Card key={group.title}>
          <SubHeading title={group.title} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {group.items.map(([key, label]) => (
              <Checkbox key={key} label={label} checked={getBool(deductions, [key])} onChange={(v) => setAnswer(["deductions", key], v)} />
            ))}
          </div>
        </Card>
      ))}
      <Card>
        <SubHeading title="Anything else?" />
        <TextArea
          label="Other credits or deductions to tell us about"
          value={getStr(deductions, ["other_credits_notes"])}
          onChange={(v) => setAnswer(["deductions", "other_credits_notes"], v)}
        />
      </Card>
    </div>
  );
}
