"use client";

import { Card, SubHeading, Checkbox, TextArea } from "./fields";
import { getBool, getStr, type AnyRecord } from "@/lib/intakeAnswers";

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
      ["moved", "Moved"], ["multiple_states", "Lived in multiple states"], ["worked_remotely", "Worked remotely"],
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
      ["bookkeeping_cleanup", "Bookkeeping cleanup needed"], ["payroll_issues", "Payroll issues"], ["contractor_reporting_issues", "Contractor reporting issues"],
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
      ["irs_notice", "IRS notice"], ["state_notice", "State notice"], ["audit", "Audit"], ["identity_theft", "Identity theft"],
      ["ip_pin", "Have an IP PIN"], ["unfiled_returns", "Unfiled returns"], ["installment_agreement", "Installment agreement"],
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

export function Section5LifeChanges({ answers, setAnswer }: { answers: AnyRecord; setAnswer: (path: string[], value: unknown) => void }) {
  const lifeChanges = (answers.life_changes as AnyRecord) || {};
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Select anything that applied to you this year -- this helps us know what to ask about.</p>
      {GROUPS.map((group) => {
        const groupAnswers = (lifeChanges[group.key] as AnyRecord) || {};
        return (
          <Card key={group.key}>
            <SubHeading title={group.title} />
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
