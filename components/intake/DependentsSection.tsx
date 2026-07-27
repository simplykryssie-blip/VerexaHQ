"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Card, SubHeading, TextField, YesNo, NumberField, Select } from "./fields";
import type { AnyRecord } from "@/lib/intakeAnswers";
import {
  DEPENDENT_RELATIONSHIPS,
  CUSTODY_ARRANGEMENTS,
  CUSTODY_NEEDS_FOLLOWUP,
  optionLabel,
} from "@/lib/intakeDependentOptions";

type Dependent = AnyRecord;

function emptyDependent(): Dependent {
  return {
    first_name: "",
    last_name: "",
    relationship: "",
    relationship_other: "",
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
    custody_other: "",
    lived_more_nights_with_taxpayer: false,
    other_parent_provided_8332: false,
    taxpayer_will_release_claim: false,
    another_person_expected_to_claim: false,
    form_8332: false,
    ip_pin: false,
    born_or_died_during_year: false,
  };
}

function hasSavedInfo(dep: Dependent) {
  return Boolean(dep.first_name || dep.last_name || dep.relationship || dep.dob);
}

function summaryLine(dep: Dependent) {
  const name = [dep.first_name, dep.last_name].filter(Boolean).join(" ") || "Unnamed dependent";
  const rel = dep.relationship === "other" ? String(dep.relationship_other || "Other") : optionLabel(DEPENDENT_RELATIONSHIPS, String(dep.relationship || ""));
  return `${name}${rel ? ` — ${rel}` : ""}`;
}

// Repeatable dependent list. No SSN collected here -- Social Security
// cards for each dependent claimed stay a document-checklist item
// (dependent_ssn_documents), not a typed field. Only one dependent is
// editable at a time: complete a card, save it, then add the next one --
// the "Add another dependent" action lives at the bottom of the section,
// never above the dependents already entered.
export function DependentsSection({ dependents, onChange }: { dependents: Dependent[]; onChange: (next: Dependent[]) => void }) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [confirmRemoveIndex, setConfirmRemoveIndex] = useState<number | null>(null);

  function update(i: number, key: string, value: unknown) {
    const next = dependents.slice();
    next[i] = { ...next[i], [key]: value };
    onChange(next);
  }
  function addDependent() {
    onChange([...dependents, emptyDependent()]);
    setEditingIndex(dependents.length);
  }
  function removeDependent(i: number) {
    onChange(dependents.filter((_, idx) => idx !== i));
    setConfirmRemoveIndex(null);
    if (editingIndex === i) setEditingIndex(null);
  }
  function requestRemove(i: number) {
    if (hasSavedInfo(dependents[i])) {
      setConfirmRemoveIndex(i);
    } else {
      removeDependent(i);
    }
  }

  return (
    <Card>
      <SubHeading title="Dependents" />
      {dependents.length === 0 && editingIndex === null && <p className="text-sm text-muted mb-2">No dependents added.</p>}

      <div className="space-y-3">
        {dependents.map((dep, i) => {
          const isEditing = editingIndex === i;
          const showFollowup = CUSTODY_NEEDS_FOLLOWUP.has(String(dep.custody || ""));

          if (!isEditing) {
            return (
              <div key={i} className="border border-line rounded-sm p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink truncate">{summaryLine(dep)}</div>
                  <div className="text-xs text-muted">
                    {dep.custody ? (dep.custody === "other" ? String(dep.custody_other || "Other") : optionLabel(CUSTODY_ARRANGEMENTS, String(dep.custody))) : "No custody arrangement noted"}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => setEditingIndex(i)} className="text-xs font-semibold text-ink border border-line rounded-sm px-2 py-1 flex items-center gap-1">
                    <Pencil size={12} /> Edit
                  </button>
                  <button type="button" onClick={() => requestRemove(i)} className="text-brick" aria-label="Remove dependent">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="border border-line rounded-sm p-3">
              <div className="text-xs font-semibold text-muted mb-2">Dependent {i + 1}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField label="Legal first name" value={String(dep.first_name || "")} onChange={(v) => update(i, "first_name", v)} />
                <TextField label="Legal last name" value={String(dep.last_name || "")} onChange={(v) => update(i, "last_name", v)} />
                <Select label="Relationship" value={String(dep.relationship || "")} onChange={(v) => update(i, "relationship", v)} options={DEPENDENT_RELATIONSHIPS} />
                {dep.relationship === "other" && (
                  <TextField label="Describe the relationship" value={String(dep.relationship_other || "")} onChange={(v) => update(i, "relationship_other", v)} />
                )}
                <TextField label="Date of birth" type="date" value={String(dep.dob || "")} onChange={(v) => update(i, "dob", v)} />
                <NumberField label="Months lived with you" value={Number(dep.months_lived || 0)} onChange={(v) => update(i, "months_lived", v)} />
              </div>

              <div className="mt-2">
                <Select label="Custody arrangement" value={String(dep.custody || "")} onChange={(v) => update(i, "custody", v)} options={CUSTODY_ARRANGEMENTS} />
                {dep.custody === "other" && (
                  <div className="mt-2">
                    <TextField label="Describe the custody arrangement" value={String(dep.custody_other || "")} onChange={(v) => update(i, "custody_other", v)} />
                  </div>
                )}
              </div>

              {showFollowup && (
                <div className="mt-1 divide-y divide-line">
                  <YesNo
                    label="Did the child live with the taxpayer more nights during the year?"
                    value={!!dep.lived_more_nights_with_taxpayer}
                    onChange={(v) => update(i, "lived_more_nights_with_taxpayer", v)}
                  />
                  <YesNo
                    label="Did the other parent provide a Form 8332?"
                    value={!!dep.other_parent_provided_8332}
                    onChange={(v) => update(i, "other_parent_provided_8332", v)}
                  />
                  <YesNo
                    label="Will the taxpayer release the dependent claim?"
                    value={!!dep.taxpayer_will_release_claim}
                    onChange={(v) => update(i, "taxpayer_will_release_claim", v)}
                  />
                  <YesNo
                    label="Is another person expected to claim this dependent?"
                    value={!!dep.another_person_expected_to_claim}
                    onChange={(v) => update(i, "another_person_expected_to_claim", v)}
                  />
                </div>
              )}

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

              <p className="text-xs text-muted mt-2">
                We collect this to help your preparer determine dependency and custody-related items -- it doesn&apos;t decide eligibility on its own.
              </p>

              <div className="flex gap-2 mt-3">
                <button type="button" onClick={() => setEditingIndex(null)} className="text-sm font-semibold bg-ink text-white px-3 py-2 rounded-sm">
                  Save dependent
                </button>
                {hasSavedInfo(dep) && (
                  <button
                    type="button"
                    onClick={() => setEditingIndex(null)}
                    className="text-sm font-semibold text-ink border border-line rounded-sm px-3 py-2"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {confirmRemoveIndex !== null && (
        <div className="mt-3 border border-brick/40 bg-brick/10 rounded-sm p-3 text-sm">
          <p className="text-ink mb-2">Remove {summaryLine(dependents[confirmRemoveIndex])}? This can&apos;t be undone.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => removeDependent(confirmRemoveIndex)} className="text-xs font-semibold bg-brick text-white px-3 py-1.5 rounded-sm">
              Remove dependent
            </button>
            <button type="button" onClick={() => setConfirmRemoveIndex(null)} className="text-xs font-semibold text-ink border border-line rounded-sm px-3 py-1.5">
              Cancel
            </button>
          </div>
        </div>
      )}

      {editingIndex === null && (
        <button
          type="button"
          onClick={addDependent}
          className="mt-3 flex items-center gap-1 text-xs font-semibold text-ink border border-line rounded-sm px-2 py-1.5"
        >
          <Plus size={14} /> Add {dependents.length > 0 ? "another " : ""}dependent
        </button>
      )}
    </Card>
  );
}
