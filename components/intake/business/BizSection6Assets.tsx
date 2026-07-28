"use client";

import { Card, SectionHeading, SubHeading, YesNo, TextField, DisclaimerNote } from "../fields";
import { getArray, getBool, getStr, type AnyRecord } from "@/lib/intakeAnswers";

function newLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `loan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyLoan(): AnyRecord {
  return { local_id: newLocalId(), lender_name: "", purpose: "" };
}

const TRUE_C_CORP = new Set(["c_corp"]);

export function BizSection6Assets({
  answers,
  setAnswer,
  entityClassification,
}: {
  answers: AnyRecord;
  setAnswer: (path: string[], value: unknown) => void;
  entityClassification: string | null;
}) {
  const assets = (answers.assets as AnyRecord) || {};
  const vehicles = (answers.vehicles as AnyRecord) || {};
  const equity = (answers.equity as AnyRecord) || {};
  const cCorp = (answers.c_corp as AnyRecord) || {};
  const loans = getArray<AnyRecord>(answers, ["loans"]);
  const isTrueCCorp = TRUE_C_CORP.has(entityClassification || "");

  function addLoan() {
    setAnswer(["loans"], [...loans, emptyLoan()]);
  }
  function updateLoan(i: number, patch: Partial<AnyRecord>) {
    setAnswer(["loans"], loans.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLoan(i: number) {
    setAnswer(["loans"], loans.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-4">
      <SectionHeading title="Assets, Vehicles, Inventory & Loans" />

      <Card>
        <SubHeading title="Assets" />
        <YesNo
          label="Did the business purchase any real property or major equipment this year?"
          value={getBool(assets, ["purchased_real_property"])}
          onChange={(v) => setAnswer(["assets", "purchased_real_property"], v)}
        />
        <YesNo
          label="Did the business sell or dispose of any assets this year?"
          value={getBool(assets, ["disposed_assets"])}
          onChange={(v) => setAnswer(["assets", "disposed_assets"], v)}
        />
      </Card>

      <Card>
        <SubHeading title="Vehicles" />
        <YesNo
          label="Does the business own or lease any vehicles?"
          value={getBool(vehicles, ["owned_or_leased"])}
          onChange={(v) => setAnswer(["vehicles", "owned_or_leased"], v)}
        />
        <YesNo
          label="Is a personal vehicle used for business purposes?"
          value={getBool(vehicles, ["personal_used_for_business"])}
          onChange={(v) => setAnswer(["vehicles", "personal_used_for_business"], v)}
        />
        {getBool(vehicles, ["personal_used_for_business"]) && (
          <YesNo
            label="Do you track business mileage for that vehicle?"
            value={getBool(vehicles, ["mileage_records_available"])}
            onChange={(v) => setAnswer(["vehicles", "mileage_records_available"], v)}
          />
        )}
      </Card>

      <Card>
        <SubHeading title="Loans" />
        {loans.length === 0 && <p className="text-xs text-muted">No business loans added.</p>}
        <div className="space-y-3">
          {loans.map((loan, i) => (
            <div key={String(loan.local_id || i)} className="border border-line rounded-sm p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted">Loan {i + 1}</span>
                <button type="button" onClick={() => removeLoan(i)} className="text-xs text-brick underline">
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField label="Lender name" value={getStr(loan, ["lender_name"])} onChange={(v) => updateLoan(i, { lender_name: v })} />
                <TextField label="Purpose" value={getStr(loan, ["purpose"])} onChange={(v) => updateLoan(i, { purpose: v })} />
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addLoan} className="text-sm font-semibold text-blue underline mt-2">
          + Add a loan
        </button>
      </Card>

      <Card>
        <SubHeading title="Equity" />
        <YesNo
          label="Do any owner capital accounts have a negative balance?"
          value={getBool(equity, ["negative_capital_accounts"])}
          onChange={(v) => setAnswer(["equity", "negative_capital_accounts"], v)}
        />
        <DisclaimerNote>If you're not sure, our team can help you determine this — leave it as No for now.</DisclaimerNote>
      </Card>

      {isTrueCCorp && (
        <Card>
          <SubHeading title="Dividends" />
          <YesNo
            label="Did the business pay any dividends to shareholders this year?"
            value={getBool(cCorp, ["dividends_paid"])}
            onChange={(v) => setAnswer(["c_corp", "dividends_paid"], v)}
          />
        </Card>
      )}
    </div>
  );
}
