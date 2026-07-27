"use client";

import { Card, SubHeading, Checkbox, TextArea } from "./fields";
import { getBool, getStr, getArray, type AnyRecord } from "@/lib/intakeAnswers";
import { stateLabel } from "@/lib/intakeStates";

const GROUPS: { key: string; title: string; items: [string, string][] }[] = [
  {
    key: "family",
    title: "Family",
    items: [
      ["marriage", "Marriage"], ["divorce", "Divorce"], ["separation", "Separation"],
      ["birth", "Birth of a child"], ["adoption", "Adoption"], ["death", "Death in the family"],
      ["dependent_changes", "Dependent changes"], ["custody_changes", "Custody changes"],
      ["child_aging_out", "Child aging out of dependency"], ["student_status_changes", "Student status changes"],
    ],
  },
  {
    key: "residence",
    title: "Residence",
    items: [
      ["moved", "Moved"], ["worked_remotely", "Worked remotely"],
      ["lived_abroad", "Lived abroad"], ["foreign_address", "Have a foreign address"], ["disaster_relocation", "Disaster-area relocation"],
    ],
  },
  {
    key: "employment",
    title: "Employment",
    items: [
      ["new_job", "New job"], ["job_loss", "Job loss"], ["retirement", "Retirement"], ["disability", "Disability"],
      ["military_service", "Military service"], ["clergy", "Clergy"], ["stock_compensation", "Stock compensation"],
      ["severance", "Severance"], ["employer_benefits", "Employer-provided benefits changed"],
    ],
  },
  {
    key: "business",
    title: "Business",
    items: [
      ["started_business", "Started a business"], ["closed_business", "Closed a business"], ["bought_business", "Bought a business"],
      ["sold_business", "Sold a business"], ["new_partner", "New business partner"], ["ownership_change", "Ownership change"],
      ["payroll_issues", "Payroll issues"], ["contractor_reporting_issues", "Contractor reporting issues"],
    ],
  },
  {
    key: "property",
    title: "Property",
    items: [
      ["bought_home", "Bought a home"], ["sold_home", "Sold a home"], ["refinanced", "Refinanced"],
      ["rental_conversion", "Converted a home to a rental"], ["foreclosure", "Foreclosure"], ["short_sale", "Short sale"],
      ["canceled_debt", "Had debt canceled"], ["inherited_property", "Inherited property"], ["gifted_property", "Gifted property"],
      ["like_kind_exchange", "Like-kind exchange"],
    ],
  },
  {
    key: "tax_compliance",
    title: "Tax compliance",
    items: [
      ["audit", "Audit"], ["installment_agreement", "Installment agreement"],
      ["offer_in_compromise", "Offer in compromise"], ["levy_or_lien", "Levy or lien"], ["prior_rejected_return", "Prior return was rejected"],
      ["bankruptcy", "Bankruptcy"],
    ],
  },
  {
    key: "foreign",
    title: "Foreign",
    items: [
      ["foreign_income", "Foreign income"], ["foreign_bank_accounts", "Foreign bank accounts"], ["foreign_assets", "Foreign assets"],
      ["foreign_trust", "Foreign trust"], ["foreign_business_ownership", "Foreign business ownership"],
      ["foreign_gifts", "Foreign gifts received"], ["foreign_inheritance", "Foreign inheritance"], ["crypto_held_abroad", "Cryptocurrency held abroad"],
    ],
  },
  {
    key: "other",
    title: "Other",
    items: [
      ["legal_settlement", "Legal settlement"], ["gambling_activity", "Significant gambling activity"],
      ["marketplace_insurance_changes", "Marketplace insurance changes"], ["disaster_loss", "Disaster loss"],
      ["casualty_loss", "Casualty loss"], ["large_gift", "Gave or received a large gift"], ["inheritance", "Inheritance"],
      ["trust_estate_distribution", "Trust or estate distribution"],
    ],
  },
];

// De-duplication note: IP PIN, identity theft, prior-year return, and
// states-lived-in are all asked exactly once, in Section 2 (Household &
// Filing Basics) -- this section shows them read-only where relevant
// instead of asking again. IRS/state notices and unfiled years live here
// (Tax Compliance) as the single authoritative location and are wired
// directly to the same top-level answer keys the checklist/complexity
// logic reads (has_irs_state_notice, has_unfiled_years) -- not a separate,
// disconnected key.
export function Section5LifeChanges({ answers, setAnswer }: { answers: AnyRecord; setAnswer: (path: string[], value: unknown) => void }) {
  const lifeChanges = (answers.life_changes as AnyRecord) || {};
  const taxpayer = (answers.taxpayer_detail as AnyRecord) || {};
  const states = getArray<string>(answers, ["states_lived_worked"]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Select anything that applied to you this year -- this helps us know what to ask about.</p>

      {GROUPS.map((group) => {
        const groupAnswers = (lifeChanges[group.key] as AnyRecord) || {};
        return (
          <Card key={group.key}>
            <SubHeading title={group.title} />

            {group.key === "residence" && states.length > 0 && (
              <p className="text-xs text-muted mb-2 bg-paperDim border border-line rounded-sm px-2.5 py-1.5">
                States lived/worked in this year (from Household & Filing Basics): {states.map(stateLabel).join(", ")}
                {states.length > 1 && " — already noted as a multistate return."}
              </p>
            )}

            {group.key === "tax_compliance" && (
              <>
                <p className="text-xs text-muted mb-2 bg-paperDim border border-line rounded-sm px-2.5 py-1.5">
                  IP PIN and identity theft are answered in the About You section (Household & Filing
                  Basics): IP PIN — {getBool(taxpayer, ["ip_pin"]) ? "Yes" : "No"}, Identity theft —{" "}
                  {getBool(taxpayer, ["identity_theft"]) ? "Yes" : "No"}.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-1.5">
                  <Checkbox
                    label="IRS or state notice"
                    checked={getBool(answers, ["has_irs_state_notice"])}
                    onChange={(v) => setAnswer(["has_irs_state_notice"], v)}
                  />
                  <Checkbox
                    label="Unfiled prior-year returns"
                    checked={getBool(answers, ["has_unfiled_years"])}
                    onChange={(v) => setAnswer(["has_unfiled_years"], v)}
                  />
                </div>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {group.items.map(([key, label]) => (
                <Checkbox
                  key={key}
                  label={label}
                  checked={getBool(groupAnswers, [key])}
                  onChange={(v) => setAnswer(["life_changes", group.key, key], v)}
                />
              ))}
            </div>
          </Card>
        );
      })}
      <Card>
        <SubHeading title="Anything else we should know?" />
        <TextArea
          label="Other life changes or special situations"
          value={getStr(lifeChanges, ["other_notes"])}
          onChange={(v) => setAnswer(["life_changes", "other_notes"], v)}
        />
      </Card>
    </div>
  );
}
