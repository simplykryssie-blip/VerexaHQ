"use client";

import { Card, SectionHeading, SubHeading, YesNo, TextField, BlankableNumberField, DisclaimerNote } from "../fields";
import { getBool, getStr, type AnyRecord } from "@/lib/intakeAnswers";

export function BizSection5Payroll({
  answers,
  setAnswer,
  entityClassification,
}: {
  answers: AnyRecord;
  setAnswer: (path: string[], value: unknown) => void;
  entityClassification: string | null;
}) {
  const payroll = (answers.payroll as AnyRecord) || {};
  const contractors = (answers.contractors as AnyRecord) || {};
  const isSCorp = entityClassification === "s_corp" || entityClassification === "llc_s_corp";

  return (
    <div className="space-y-4">
      <SectionHeading title="Payroll, Contractors & Owner Compensation" />

      <Card>
        <SubHeading title="Employees" />
        <YesNo
          label="Does the business have W-2 employees?"
          value={getBool(payroll, ["has_employees"])}
          onChange={(v) => setAnswer(["payroll", "has_employees"], v)}
        />
        {getBool(payroll, ["has_employees"]) && (
          <div className="space-y-1 mt-2">
            <BlankableNumberField
              label="How many employees?"
              value={(payroll.employee_count as number) ?? null}
              onChange={(v) => setAnswer(["payroll", "employee_count"], v)}
              min={1}
            />
            <TextField
              label="Payroll provider (if any)"
              value={getStr(payroll, ["provider_name"])}
              onChange={(v) => setAnswer(["payroll", "provider_name"], v)}
            />
            <YesNo
              label="Are all payroll tax returns (941/940 and state) filed and up to date?"
              value={getBool(payroll, ["all_returns_filed"])}
              onChange={(v) => setAnswer(["payroll", "all_returns_filed"], v)}
            />
            <YesNo
              label="Were any payroll tax deposits made late this year?"
              value={getBool(payroll, ["late_deposits"])}
              onChange={(v) => setAnswer(["payroll", "late_deposits"], v)}
            />
            <YesNo
              label="Does the business owe any unpaid payroll taxes?"
              value={getBool(payroll, ["unpaid_payroll_tax"])}
              onChange={(v) => setAnswer(["payroll", "unpaid_payroll_tax"], v)}
            />
          </div>
        )}
      </Card>

      <Card>
        <SubHeading title="Contractors" />
        <YesNo
          label="Did the business pay any independent contractors this year?"
          value={getBool(contractors, ["has_contractors"])}
          onChange={(v) => setAnswer(["contractors", "has_contractors"], v)}
        />
        {getBool(contractors, ["has_contractors"]) && (
          <div className="space-y-1 mt-2">
            <BlankableNumberField
              label="How many contractors?"
              value={(contractors.contractor_count as number) ?? null}
              onChange={(v) => setAnswer(["contractors", "contractor_count"], v)}
              min={1}
            />
            <YesNo
              label="Do you have a completed Form W-9 on file for each contractor?"
              value={getBool(contractors, ["w9_collected"])}
              onChange={(v) => setAnswer(["contractors", "w9_collected"], v)}
            />
            <YesNo
              label="Are there any contractor payments you're not sure were reported on a 1099?"
              value={getBool(contractors, ["unreported_payments"])}
              onChange={(v) => setAnswer(["contractors", "unreported_payments"], v)}
            />
            <YesNo
              label="Are you unsure whether any of these workers should have been classified as employees instead?"
              value={getBool(contractors, ["worker_classification_concern"])}
              onChange={(v) => setAnswer(["contractors", "worker_classification_concern"], v)}
            />
          </div>
        )}
      </Card>

      {isSCorp && (
        <DisclaimerNote>
          Because this business is taxed as an S corporation, our team will review owner
          compensation for reasonableness as part of preparing this return — no extra input is
          needed from you here.
        </DisclaimerNote>
      )}
    </div>
  );
}
