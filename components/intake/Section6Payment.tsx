"use client";

import { Card, SubHeading, Select, TextArea, YesNo, Checkbox } from "./fields";
import { getBool, getStr, getArray, type AnyRecord } from "@/lib/intakeAnswers";

const ASSISTANCE_TYPES: [string, string][] = [
  ["uploading_documents", "Uploading documents"],
  ["completing_forms", "Completing forms"],
  ["understanding_instructions", "Reading or understanding instructions"],
  ["electronic_signatures", "Electronic signatures"],
  ["language_assistance", "Language assistance"],
  ["accessibility_assistance", "Accessibility assistance"],
  ["using_a_device", "Using a mobile phone or computer"],
  ["other", "Other"],
];

// Portal-assistance answers only ever create a staff-visible
// client-assistance flag (see review_flags in recompute_intake_flags) --
// they're deliberately never read by any complexity, pricing, or
// acceptance logic.
export function Section6Payment({ answers, setAnswer }: { answers: AnyRecord; setAnswer: (path: string[], value: unknown) => void }) {
  const readiness = (answers.readiness as AnyRecord) || {};
  const portalHelp = getStr(readiness, ["portal_help"]);
  const needsAssistance = portalHelp === "yes_may_need_help" || portalHelp === "someone_will_assist" || portalHelp === "other_accommodation";
  const assistanceTypes = getArray<string>(readiness, ["assistance_types"]);

  function toggleAssistance(key: string) {
    const has = assistanceTypes.includes(key);
    setAnswer(["readiness", "assistance_types"], has ? assistanceTypes.filter((k) => k !== key) : [...assistanceTypes, key]);
  }

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
        </div>

        <div className="mt-3 pt-3 border-t border-line">
          <Select
            label="Will you need help using the online portal?"
            value={portalHelp}
            onChange={(v) => setAnswer(["readiness", "portal_help"], v)}
            options={[
              ["", "Select…"],
              ["no_can_complete_alone", "No, I can complete the portal on my own"],
              ["yes_may_need_help", "Yes, I may need help"],
              ["someone_will_assist", "Someone will assist me"],
              ["other_accommodation", "I prefer another accommodation"],
            ]}
          />
          {needsAssistance && (
            <div className="mt-2">
              <div className="text-xs font-semibold text-muted mb-1">What kind of help would be useful?</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {ASSISTANCE_TYPES.map(([key, label]) => (
                  <Checkbox key={key} label={label} checked={assistanceTypes.includes(key)} onChange={() => toggleAssistance(key)} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-line">
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
