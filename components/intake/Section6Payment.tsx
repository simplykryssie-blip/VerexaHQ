"use client";

import { Card, SubHeading, Select, TextArea, YesNo, Checkbox, DisclaimerNote } from "./fields";
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
// acceptance logic. Nothing on this screen commits the client to a
// binding payment plan or bank-product agreement -- that only happens
// later, after a quote, with full terms disclosed at that time.
export function Section6Payment({ answers, setAnswer }: { answers: AnyRecord; setAnswer: (path: string[], value: unknown) => void }) {
  const readiness = (answers.readiness as AnyRecord) || {};
  const portalHelp = getStr(readiness, ["portal_help"]);
  const needsAssistance = portalHelp === "yes_may_need_help" || portalHelp === "someone_will_assist" || portalHelp === "other_accommodation";
  const assistanceTypes = getArray<string>(readiness, ["assistance_types"]);
  const paymentPreference = getStr(answers, ["payment_preference"]);
  const preferredNextStep = getStr(readiness, ["preferred_next_step"]);

  function toggleAssistance(key: string) {
    const has = assistanceTypes.includes(key);
    setAnswer(["readiness", "assistance_types"], has ? assistanceTypes.filter((k) => k !== key) : [...assistanceTypes, key]);
  }

  function handleNextStepChange(next: string) {
    setAnswer(["readiness", "preferred_next_step"], next);
    setAnswer(["readiness", "consultation_requested"], next === "consultation_first");
  }

  return (
    <div className="space-y-4">
      <SubHeading title="Service Preferences and Payment Options" />
      <p className="text-sm text-muted">These answers help the firm prepare the appropriate quote and service package. No payment is due from this screen.</p>

      <Card>
        <Select
          label="Preferred next step"
          value={preferredNextStep}
          onChange={handleNextStepChange}
          options={[
            ["", "Select…"],
            ["send_quote", "Send me a quote if enough information is available"],
            ["consultation_first", "I would like a consultation first"],
            ["unsure", "I am unsure"],
          ]}
        />
      </Card>

      <Card>
        <Select
          label="Preferred payment option"
          value={paymentPreference}
          onChange={(v) => setAnswer(["payment_preference"], v)}
          options={[
            ["", "Select…"],
            ["upfront", "Pay preparation fees directly"],
            ["refund", "Ask whether fees may be paid from my refund"],
            ["discuss", "Discuss payment options"],
            ["unsure", "Unsure"],
          ]}
        />
        {paymentPreference === "refund" && (
          <div className="mt-2 space-y-2">
            <DisclaimerNote>
              Paying preparation fees from your refund may involve additional bank or processing fees and is
              subject to eligibility and approval. If your refund is delayed, reduced, offset, or insufficient, you
              remain responsible for any unpaid preparation fees. Full terms and fees will be provided before you
              authorize this payment method.
            </DisclaimerNote>
            <div className="divide-y divide-line">
              <YesNo
                label="Is another person responsible for the preparation fee?"
                value={getBool(readiness, ["another_person_responsible_for_fee"])}
                onChange={(v) => setAnswer(["readiness", "another_person_responsible_for_fee"], v)}
              />
              <YesNo
                label="Would you like to discuss this option before receiving the quote?"
                value={getBool(readiness, ["discuss_before_quote"])}
                onChange={(v) => setAnswer(["readiness", "discuss_before_quote"], v)}
              />
            </div>
          </div>
        )}
      </Card>

      <Card>
        <SubHeading title="Engagement readiness" />
        <div className="divide-y divide-line">
          <YesNo label="Interested in expedited service" value={getBool(readiness, ["expedited_interest"])} onChange={(v) => setAnswer(["readiness", "expedited_interest"], v)} />
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

        <div className="mt-3 pt-3 border-t border-line">
          <TextArea
            label="Any important deadline or travel date we should know about?"
            value={getStr(readiness, ["deadline_concerns"])}
            onChange={(v) => setAnswer(["readiness", "deadline_concerns"], v)}
          />
        </div>
      </Card>
    </div>
  );
}
