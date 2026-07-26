"use client";

import { Plus, Trash2 } from "lucide-react";
import { Card, SubHeading, TextField, YesNo, NumberField } from "./fields";
import type { AnyRecord } from "@/lib/intakeAnswers";

type Dependent = AnyRecord;

function emptyDependent(): Dependent {
  return {
    first_name: "",
    last_name: "",
    relationship: "",
    dob: "",
    months_lived: 12,
    student: false,
    disabled: false,
    income: false,
    support: "",
    childcare: false,
    education: false,
    others_may_claim: false,
    custody: "",
    form_8332: false,
    ip_pin: false,
    born_or_died_during_year: false,
  };
}

// Repeatable dependent list. No SSN collected here either -- Social
// Security cards for each dependent claimed stay a document-checklist
// item (dependent_ssn_documents), not a typed field.
export function DependentsSection({ dependents, onChange }: { dependents: Dependent[]; onChange: (next: Dependent[]) => void }) {
  function update(i: number, key: string, value: unknown) {
    const next = dependents.slice();
    next[i] = { ...next[i], [key]: value };
    onChange(next);
  }
  function add() {
    onChange([...dependents, emptyDependent()]);
  }
  function remove(i: number) {
    onChange(dependents.filter((_, idx) => idx !== i));
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <SubHeading title="Dependents" />
        <button type="button" onClick={add} className="flex items-center gap-1 text-xs font-semibold text-ink border border-line rounded-sm px-2 py-1">
          <Plus size={14} /> Add dependent
        </button>
      </div>
      {dependents.length === 0 && <p className="text-sm text-muted">No dependents added.</p>}
      <div className="space-y-4">
        {dependents.map((dep, i) => (
          <div key={i} className="border border-line rounded-sm p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted">Dependent {i + 1}</span>
              <button type="button" onClick={() => remove(i)} className="text-brick" aria-label="Remove dependent">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField label="Legal first name" value={String(dep.first_name || "")} onChange={(v) => update(i, "first_name", v)} />
              <TextField label="Legal last name" value={String(dep.last_name || "")} onChange={(v) => update(i, "last_name", v)} />
              <TextField label="Relationship" value={String(dep.relationship || "")} onChange={(v) => update(i, "relationship", v)} placeholder="Son, daughter, grandchild…" />
              <TextField label="Date of birth" type="date" value={String(dep.dob || "")} onChange={(v) => update(i, "dob", v)} />
              <NumberField label="Months lived with you" value={Number(dep.months_lived || 0)} onChange={(v) => update(i, "months_lived", v)} />
              <TextField label="Custody arrangement" value={String(dep.custody || "")} onChange={(v) => update(i, "custody", v)} placeholder="Full, shared, other…" />
            </div>
            <div className="mt-1 divide-y divide-line">
              <YesNo label="Full-time student" value={!!dep.student} onChange={(v) => update(i, "student", v)} />
              <YesNo label="Has a disability" value={!!dep.disabled} onChange={(v) => update(i, "disabled", v)} />
              <YesNo label="Had income of their own" value={!!dep.income} onChange={(v) => update(i, "income", v)} />
              <YesNo label="You provided childcare costs for them" value={!!dep.childcare} onChange={(v) => update(i, "childcare", v)} />
              <YesNo label="You paid education expenses for them" value={!!dep.education} onChange={(v) => update(i, "education", v)} />
              <YesNo label="Someone else may also be able to claim them" value={!!dep.others_may_claim} onChange={(v) => update(i, "others_may_claim", v)} />
              <YesNo label="You have a signed Form 8332 for them" value={!!dep.form_8332} onChange={(v) => update(i, "form_8332", v)} />
              <YesNo label="They have an IRS Identity Protection PIN" value={!!dep.ip_pin} onChange={(v) => update(i, "ip_pin", v)} />
              <YesNo label="They were born or passed away during the year" value={!!dep.born_or_died_during_year} onChange={(v) => update(i, "born_or_died_during_year", v)} />
            </div>
            <div className="mt-2">
              <TextField label="Support / living situation notes (optional)" value={String(dep.support || "")} onChange={(v) => update(i, "support", v)} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
