"use client";

import { Card, SubHeading, Select, TextArea, YesNo } from "./fields";
import { getBool, getStr, type AnyRecord } from "@/lib/intakeAnswers";

export function Section6Payment({ answers, setAnswer }: { answers: AnyRecord; setAnswer: (path: string[], value: unknown) => void }) {
  const readiness = (answers.readiness as AnyRecord) || {};
  return (
    <div className="space-y-4">
      <Card>
        <SubHeading title="Payment preference" />
        <Select
          label="How would you prefer to pay for our services?"
          value={getStr(answers, ["payment_preference"])}
          onChange={(v) => setAnswer(["payment_preference"], v)}
          options={[
            ["", "Select…"],
            ["upfront", "Pay upfront"],
            ["refund", "Deduct from my refund"],
            ["unsure", "Not sure yet"],
            ["discuss", "I'd like to discuss this with staff"],
          ]}
        />
        <div className="mt-3">
          <Select
            label="Preferred payment timing"
            value={getStr(readiness, ["preferred_timing"])}
            onChange={(v) => setAnswer(["readiness", "preferred_timing"], v)}
            options={[
              ["", "Select…"],
              ["as_soon_as_possible", "As soon as possible"],
              ["at_filing", "At filing"],
              ["installments", "In installments"],
            ]}
          />
        </div>
        <div className="mt-2 divide-y divide-line">
          <YesNo label="Able to make a deposit if needed" value={getBool(readiness, ["deposit_ability"])} onChange={(v) => setAnswer(["readiness", "deposit_ability"], v)} />
          <YesNo label="Payment will come from a third party" value={getBool(readiness, ["third_party_payer"])} onChange={(v) => setAnswer(["readiness", "third_party_payer"], v)} />
          <YesNo label="Spouse or co-client will share payment" value={getBool(readiness, ["spouse_co_payer"])} onChange={(v) => setAnswer(["readiness", "spouse_co_payer"], v)} />
        </div>
      </Card>

      <Card>
        <SubHeading title="Engagement readiness" />
        <div className="divide-y divide-line">
          <YesNo label="Interested in expedited service" value={getBool(readiness, ["expedited_interest"])} onChange={(v) => setAnswer(["readiness", "expedited_interest"], v)} />
          <YesNo label="Would like a consultation before we proceed" value={getBool(readiness, ["consultation_requested"])} onChange={(v) => setAnswer(["readiness", "consultation_requested"], v)} />
          <YesNo label="Able to use our client portal independently" value={getBool(readiness, ["portal_independent"])} onChange={(v) => setAnswer(["readiness", "portal_independent"], v)} />
          <YesNo label="Would benefit from accessibility assistance" value={getBool(readiness, ["accessibility_needed"])} onChange={(v) => setAnswer(["readiness", "accessibility_needed"], v)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <Select
            label="Best contact method"
            value={getStr(readiness, ["best_contact_method"])}
            onChange={(v) => setAnswer(["readiness", "best_contact_method"], v)}
            options={[["", "Select…"], ["email", "Email"], ["phone", "Phone"], ["text", "Text"], ["portal", "Portal message"]]}
          />
          <Select
            label="Best contact time"
            value={getStr(readiness, ["best_contact_time"])}
            onChange={(v) => setAnswer(["readiness", "best_contact_time"], v)}
            options={[["", "Select…"], ["morning", "Morning"], ["afternoon", "Afternoon"], ["evening", "Evening"], ["anytime", "Anytime"]]}
          />
        </div>
        <div className="mt-2">
          <TextArea
            label="Any deadline or travel concerns we should know about?"
            value={getStr(readiness, ["deadline_concerns"])}
            onChange={(v) => setAnswer(["readiness", "deadline_concerns"], v)}
          />
        </div>
      </Card>
    </div>
  );
}
