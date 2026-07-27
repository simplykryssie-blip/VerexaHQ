"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Card, SubHeading, TextField, YesNo, NumberField, Select, DisclaimerNote } from "./fields";
import { SecureIdentityField } from "./SecureIdentityField";
import type { AnyRecord } from "@/lib/intakeAnswers";
import { DEPENDENT_RELATIONSHIPS, LIVING_SITUATION_OPTIONS, optionLabel } from "@/lib/intakeDependentOptions";

type Dependent = AnyRecord;

function newLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dep-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyDependent(): Dependent {
  return {
    local_id: newLocalId(),
    first_name: "",
    middle_name: "",
    last_name: "",
    relationship: "",
    relationship_other: "",
    dob: "",
    months_lived: 12,
    disabled: false,
    income: false,
    provided_more_than_half_own_support: false,
    student: false,
    childcare_needed: false,
    childcare_providers: [],
    education: false,
    born_or_died_during_year: false,
    could_another_claim: "",
    living_situation: "",
    approx_nights_taxpayer: 0,
    approx_nights_other: 0,
    expected_claimant: "",
    has_court_order: false,
    form_8332_involved: false,
    taxpayer_signed_or_received_8332: false,
    additional_explanation: "",
  };
}

function emptyChildcareProvider(): AnyRecord {
  return { local_id: newLocalId(), name: "", address: "", phone: "", amount_paid: 0, note: "" };
}

function hasSavedInfo(dep: Dependent) {
  return Boolean(dep.first_name || dep.last_name || dep.relationship || dep.dob);
}

function summaryLine(dep: Dependent) {
  const name = [dep.first_name, dep.last_name].filter(Boolean).join(" ") || "Unnamed dependent";
  const rel = dep.relationship === "other" ? String(dep.relationship_other || "Other") : optionLabel(DEPENDENT_RELATIONSHIPS, String(dep.relationship || ""));
  return `${name}${rel ? ` — ${rel}` : ""}`;
}

// Age at December 31 of the tax year -- the relevant cutoff for the
// full-time-student question -- not age today. Unknown/invalid DOB
// deliberately shows no age-gated question rather than guessing.
function ageAtYearEnd(dob: string, taxYear: number): number | null {
  const year = Number((dob || "").slice(0, 4));
  if (!year || Number.isNaN(year)) return null;
  return taxYear - year;
}

// Repeatable dependent list. No SSN/ITIN typed here in the open -- that
// goes through the secure identity vault (SecureIdentityField), never the
// broadly-readable answers object. Only one dependent is editable at a
// time: complete a card, save it, then add the next one -- "Add another
// dependent" lives at the bottom of the section, never above.
export function DependentsSection({
  dependents,
  onChange,
  token,
  taxYear,
}: {
  dependents: Dependent[];
  onChange: (next: Dependent[]) => void;
  token: string;
  taxYear: number;
}) {
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

  function updateProviders(i: number, next: AnyRecord[]) {
    update(i, "childcare_providers", next);
  }

  return (
    <Card>
      <SubHeading title="Dependents" />
      {dependents.length === 0 && editingIndex === null && <p className="text-sm text-muted mb-2">No dependents added.</p>}

      <div className="space-y-3">
        {dependents.map((dep, i) => {
          const isEditing = editingIndex === i;
          const age = ageAtYearEnd(String(dep.dob || ""), taxYear);
          const showStudentQuestion = age !== null && age >= 19 && age <= 23;
          const couldAnotherClaim = String(dep.could_another_claim || "");
          const showClaimSubsection = couldAnotherClaim === "yes" || couldAnotherClaim === "unsure";
          const livingSituation = String(dep.living_situation || "");
          const providers = Array.isArray(dep.childcare_providers) ? (dep.childcare_providers as AnyRecord[]) : [];

          if (!isEditing) {
            return (
              <div key={String(dep.local_id || i)} className="border border-line rounded-sm p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink truncate">{summaryLine(dep)}</div>
                  <div className="text-xs text-muted">
                    {couldAnotherClaim === "yes" ? "Another person may claim this dependent" : couldAnotherClaim === "unsure" ? "Unsure whether another person may claim this dependent" : "No claim conflict noted"}
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
            <div key={String(dep.local_id || i)} className="border border-line rounded-sm p-3">
              <div className="text-xs font-semibold text-muted mb-2">Dependent {i + 1}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField label="Legal first name" value={String(dep.first_name || "")} onChange={(v) => update(i, "first_name", v)} />
                <TextField label="Middle name or initial" value={String(dep.middle_name || "")} onChange={(v) => update(i, "middle_name", v)} />
                <TextField label="Legal last name" value={String(dep.last_name || "")} onChange={(v) => update(i, "last_name", v)} />
                <Select label="Relationship" value={String(dep.relationship || "")} onChange={(v) => update(i, "relationship", v)} options={DEPENDENT_RELATIONSHIPS} />
                {dep.relationship === "other" && (
                  <TextField label="Describe the relationship" value={String(dep.relationship_other || "")} onChange={(v) => update(i, "relationship_other", v)} />
                )}
                <TextField label="Date of birth *" type="date" value={String(dep.dob || "")} onChange={(v) => update(i, "dob", v)} />
                <NumberField label="Months lived with you" value={Number(dep.months_lived || 0)} onChange={(v) => update(i, "months_lived", v)} />
              </div>

              <div className="mt-3">
                <SecureIdentityField
                  token={token}
                  personType="dependent"
                  personRef={String(dep.local_id || "")}
                  personLabel={[dep.first_name, dep.last_name].filter(Boolean).join(" ") || "This dependent's"}
                  kind="tax_id"
                  required
                />
              </div>

              <div className="mt-1 divide-y divide-line">
                {showStudentQuestion && (
                  <YesNo
                    label="Was this person a full-time student for at least five months during the tax year?"
                    value={!!dep.student}
                    onChange={(v) => update(i, "student", v)}
                  />
                )}
                <YesNo label="Permanently and totally disabled" value={!!dep.disabled} onChange={(v) => update(i, "disabled", v)} />
                <YesNo label="Had income of their own" value={!!dep.income} onChange={(v) => update(i, "income", v)} />
                <YesNo
                  label="Provided more than half of their own support"
                  value={!!dep.provided_more_than_half_own_support}
                  onChange={(v) => update(i, "provided_more_than_half_own_support", v)}
                />
                <YesNo label="You paid education expenses for them" value={!!dep.education} onChange={(v) => update(i, "education", v)} />
                <YesNo label="They were born or passed away during the year" value={!!dep.born_or_died_during_year} onChange={(v) => update(i, "born_or_died_during_year", v)} />
              </div>

              <div className="mt-3">
                <SecureIdentityField
                  token={token}
                  personType="dependent"
                  personRef={String(dep.local_id || "")}
                  personLabel={[dep.first_name, dep.last_name].filter(Boolean).join(" ") || "This dependent's"}
                  kind="ip_pin"
                />
              </div>

              <div className="mt-3 pt-3 border-t border-line">
                <YesNo
                  label="Did you pay someone to care for this dependent so you or your spouse could work or look for work?"
                  value={!!dep.childcare_needed}
                  onChange={(v) => update(i, "childcare_needed", v)}
                />
                {!!dep.childcare_needed && (
                  <div className="mt-2 space-y-3">
                    {providers.map((p, pi) => (
                      <div key={String(p.local_id || pi)} className="border border-line rounded-sm p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-muted">Provider {pi + 1}</span>
                          <button
                            type="button"
                            onClick={() => updateProviders(i, providers.filter((_, idx) => idx !== pi))}
                            className="text-brick"
                            aria-label="Remove provider"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <TextField
                            label="Provider or business name"
                            value={String(p.name || "")}
                            onChange={(v) => updateProviders(i, providers.map((x, idx) => (idx === pi ? { ...x, name: v } : x)))}
                          />
                          <TextField
                            label="Address"
                            value={String(p.address || "")}
                            onChange={(v) => updateProviders(i, providers.map((x, idx) => (idx === pi ? { ...x, address: v } : x)))}
                          />
                          <TextField
                            label="Phone number"
                            type="tel"
                            value={String(p.phone || "")}
                            onChange={(v) => updateProviders(i, providers.map((x, idx) => (idx === pi ? { ...x, phone: v } : x)))}
                          />
                          <NumberField
                            label="Amount paid"
                            value={Number(p.amount_paid || 0)}
                            onChange={(v) => updateProviders(i, providers.map((x, idx) => (idx === pi ? { ...x, amount_paid: v } : x)))}
                          />
                        </div>
                        <div className="mt-2">
                          <SecureIdentityField
                            token={token}
                            personType="childcare_provider"
                            personRef={String(p.local_id || "")}
                            personLabel={String(p.name || "Provider")}
                            kind="provider_tax_id"
                          />
                        </div>
                        <div className="mt-2">
                          <TextField
                            label="Notes"
                            value={String(p.note || "")}
                            onChange={(v) => updateProviders(i, providers.map((x, idx) => (idx === pi ? { ...x, note: v } : x)))}
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => updateProviders(i, [...providers, emptyChildcareProvider()])}
                      className="flex items-center gap-1 text-xs font-semibold text-ink border border-line rounded-sm px-2 py-1.5"
                    >
                      <Plus size={14} /> Add {providers.length > 0 ? "another " : ""}provider
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-line">
                <Select
                  label="Could another parent or person potentially claim this dependent?"
                  value={couldAnotherClaim}
                  onChange={(v) => update(i, "could_another_claim", v)}
                  options={[
                    ["", "Select…"],
                    ["no", "No"],
                    ["yes", "Yes"],
                    ["unsure", "Unsure"],
                  ]}
                />
                {showClaimSubsection && (
                  <div className="mt-2 space-y-2">
                    <DisclaimerNote>
                      Only one taxpayer may use the same qualifying child for certain tax benefits. If another person
                      may claim this dependent, your preparer will review the IRS relationship, residency, support,
                      and tiebreaker rules.
                    </DisclaimerNote>
                    <Select
                      label="What best describes where this dependent lived?"
                      value={livingSituation}
                      onChange={(v) => update(i, "living_situation", v)}
                      options={LIVING_SITUATION_OPTIONS}
                    />
                    {livingSituation !== "" && (
                      <>
                        {livingSituation === "split_time" && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <NumberField
                              label="Approximate nights with taxpayer"
                              value={Number(dep.approx_nights_taxpayer || 0)}
                              onChange={(v) => update(i, "approx_nights_taxpayer", v)}
                            />
                            <NumberField
                              label="Approximate nights with other parent or guardian"
                              value={Number(dep.approx_nights_other || 0)}
                              onChange={(v) => update(i, "approx_nights_other", v)}
                            />
                          </div>
                        )}
                        <TextField
                          label="Who is expected to claim the dependent this year?"
                          value={String(dep.expected_claimant || "")}
                          onChange={(v) => update(i, "expected_claimant", v)}
                        />
                        <div className="divide-y divide-line">
                          <YesNo label="Is there a court order or written agreement?" value={!!dep.has_court_order} onChange={(v) => update(i, "has_court_order", v)} />
                          <YesNo label="Is Form 8332 involved?" value={!!dep.form_8332_involved} onChange={(v) => update(i, "form_8332_involved", v)} />
                          {!!dep.form_8332_involved && (
                            <YesNo
                              label="Did the taxpayer sign or receive Form 8332?"
                              value={!!dep.taxpayer_signed_or_received_8332}
                              onChange={(v) => update(i, "taxpayer_signed_or_received_8332", v)}
                            />
                          )}
                        </div>
                        <TextField
                          label="Additional explanation (optional)"
                          value={String(dep.additional_explanation || "")}
                          onChange={(v) => update(i, "additional_explanation", v)}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>

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
