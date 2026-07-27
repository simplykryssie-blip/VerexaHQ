"use client";

import { Plus, Trash2 } from "lucide-react";
import { TextField, Select, YesNo } from "./fields";
import { ABSENCE_REASONS } from "@/lib/intakeDependentOptions";
import type { AnyRecord } from "@/lib/intakeAnswers";

type Absence = AnyRecord;

function emptyAbsence(): Absence {
  return {
    person: "", relationship: "", reason: "", reason_other: "",
    start_date: "", return_date: "", returned_to_home: false,
    remained_permanent_residence: false, explanation: "",
  };
}

function approxMonths(start: string, end: string): number | null {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return null;
  const days = (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
  return Math.round((days / 30.44) * 10) / 10;
}

// Repeatable structured entries rather than a bare "6+ months" checkbox --
// the form shows an approximate duration once both dates are entered, but
// deliberately never states a tax conclusion (e.g. "this counts as living
// with you"); that determination stays with staff.
export function TemporaryAbsences({ answers, setAnswer }: { answers: AnyRecord; setAnswer: (path: string[], value: unknown) => void }) {
  const household = (answers.household_detail as AnyRecord) || {};
  const status = String(household.temporary_absences_status || "");
  const absences: Absence[] = Array.isArray(household.temporary_absences) ? (household.temporary_absences as Absence[]) : [];

  function setAbsences(next: Absence[]) {
    setAnswer(["household_detail", "temporary_absences"], next);
  }
  function update(i: number, key: string, value: unknown) {
    const next = absences.slice();
    next[i] = { ...next[i], [key]: value };
    setAbsences(next);
  }
  function add() {
    setAbsences([...absences, emptyAbsence()]);
  }
  function remove(i: number) {
    setAbsences(absences.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <Select
        label="Was anyone temporarily away from the home during the tax year?"
        value={status}
        onChange={(v) => {
          setAnswer(["household_detail", "temporary_absences_status"], v);
          if (v !== "yes") setAbsences([]);
        }}
        options={[
          ["", "Select…"],
          ["yes", "Yes"],
          ["no", "No"],
          ["unsure", "Unsure"],
        ]}
      />

      {status === "yes" && (
        <div className="mt-3 space-y-3">
          {absences.map((a, i) => {
            const months = approxMonths(String(a.start_date || ""), String(a.return_date || ""));
            return (
              <div key={i} className="border border-line rounded-sm p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted">Absence {i + 1}</span>
                  <button type="button" onClick={() => remove(i)} className="text-brick" aria-label="Remove absence">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextField label="Person" value={String(a.person || "")} onChange={(v) => update(i, "person", v)} />
                  <TextField label="Relationship to taxpayer" value={String(a.relationship || "")} onChange={(v) => update(i, "relationship", v)} />
                  <Select label="Reason for absence" value={String(a.reason || "")} onChange={(v) => update(i, "reason", v)} options={ABSENCE_REASONS} />
                  {a.reason === "other" && (
                    <TextField label="Describe the reason" value={String(a.reason_other || "")} onChange={(v) => update(i, "reason_other", v)} />
                  )}
                  <TextField label="Start date" type="date" value={String(a.start_date || "")} onChange={(v) => update(i, "start_date", v)} />
                  <TextField label="Return date" type="date" value={String(a.return_date || "")} onChange={(v) => update(i, "return_date", v)} />
                </div>
                {months !== null && (
                  <p className="text-xs text-muted mt-2">Approximate duration: ~{months} month{months === 1 ? "" : "s"}</p>
                )}
                <div className="mt-1 divide-y divide-line">
                  <YesNo label="Did the person return to the home?" value={!!a.returned_to_home} onChange={(v) => update(i, "returned_to_home", v)} />
                  <YesNo label="Did the home remain their permanent residence?" value={!!a.remained_permanent_residence} onChange={(v) => update(i, "remained_permanent_residence", v)} />
                </div>
                <div className="mt-2">
                  <TextField label="Explanation (optional)" value={String(a.explanation || "")} onChange={(v) => update(i, "explanation", v)} />
                </div>
              </div>
            );
          })}
          <button type="button" onClick={add} className="flex items-center gap-1 text-xs font-semibold text-ink border border-line rounded-sm px-2 py-1.5">
            <Plus size={14} /> Add {absences.length > 0 ? "another " : ""}absence
          </button>
        </div>
      )}
    </div>
  );
}
