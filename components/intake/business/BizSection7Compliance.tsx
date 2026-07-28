"use client";

import { Card, SectionHeading, SubHeading, YesNo } from "../fields";
import { getBool, type AnyRecord } from "@/lib/intakeAnswers";

export function BizSection7Compliance({
  answers,
  setAnswer,
}: {
  answers: AnyRecord;
  setAnswer: (path: string[], value: unknown) => void;
}) {
  const businessStatus = (answers.business_status as AnyRecord) || {};
  const relatedParty = ((answers.changes_compliance as AnyRecord)?.related_party as AnyRecord) || {};
  const taxCompliance = ((answers.changes_compliance as AnyRecord)?.tax_compliance as AnyRecord) || {};

  return (
    <div className="space-y-4">
      <SectionHeading title="Changes & Compliance" hint="Anything unusual that happened this year." />

      <Card>
        <SubHeading title="Business status" />
        <YesNo
          label="Was the business sold this year?"
          value={getBool(businessStatus, ["was_sold"])}
          onChange={(v) => setAnswer(["business_status", "was_sold"], v)}
        />
        <YesNo
          label="Did the business merge with another business this year?"
          value={getBool(businessStatus, ["was_merged"])}
          onChange={(v) => setAnswer(["business_status", "was_merged"], v)}
        />
        <YesNo
          label="Did the business convert to a different entity type this year?"
          value={getBool(businessStatus, ["was_converted"])}
          onChange={(v) => setAnswer(["business_status", "was_converted"], v)}
        />
        <YesNo
          label="Did ownership of the business change this year (someone joined or left)?"
          value={getBool(businessStatus, ["ownership_changed"])}
          onChange={(v) => setAnswer(["business_status", "ownership_changed"], v)}
        />
      </Card>

      <Card>
        <SubHeading title="Related-party transactions" />
        <p className="text-xs text-muted mb-1">
          Beyond any owner loans you already told us about, has the business bought, sold, or
          leased anything with:
        </p>
        <YesNo
          label="An owner personally?"
          value={getBool(relatedParty, ["with_owners"])}
          onChange={(v) => setAnswer(["changes_compliance", "related_party", "with_owners"], v)}
        />
        <YesNo
          label="A relative of an owner?"
          value={getBool(relatedParty, ["with_relatives"])}
          onChange={(v) => setAnswer(["changes_compliance", "related_party", "with_relatives"], v)}
        />
        <YesNo
          label="Another business commonly owned by the same people?"
          value={getBool(relatedParty, ["with_commonly_owned"])}
          onChange={(v) => setAnswer(["changes_compliance", "related_party", "with_commonly_owned"], v)}
        />
      </Card>

      <Card>
        <SubHeading title="Tax compliance" />
        <YesNo
          label="Is the business currently under audit?"
          value={getBool(taxCompliance, ["audit"])}
          onChange={(v) => setAnswer(["changes_compliance", "tax_compliance", "audit"], v)}
        />
        <YesNo
          label="Does the business have a tax lien or levy against it?"
          value={getBool(taxCompliance, ["lien_or_levy"])}
          onChange={(v) => setAnswer(["changes_compliance", "tax_compliance", "lien_or_levy"], v)}
        />
        <YesNo
          label="Is the business on a payment plan (installment agreement) with the IRS or a state?"
          value={getBool(taxCompliance, ["installment_agreement"])}
          onChange={(v) => setAnswer(["changes_compliance", "tax_compliance", "installment_agreement"], v)}
        />
      </Card>
    </div>
  );
}
