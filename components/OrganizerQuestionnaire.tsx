"use client";

import { useEffect, useState } from "react";
import CurrencyInput from "@/components/CurrencyInput";
import DateField from "@/components/DateField";
import { ORGANIZER_FORMAT_CONFIG } from "@/lib/organizerFormat";
import { isQuestionAnswered, isQuestionVisible } from "@/lib/organizerVisibility";
import type { TaxOrganizerAnswer, TaxOrganizerQuestion, TaxOrganizerSection } from "@/lib/types";

type Props = {
  sections: TaxOrganizerSection[];
  questions: TaxOrganizerQuestion[];
  answers: Map<string, TaxOrganizerAnswer>;
  savingQuestionId: string | null;
  onSave: (question: TaxOrganizerQuestion, value: unknown) => void;
};

export default function OrganizerQuestionnaire({ sections, questions, answers, savingQuestionId, onSave }: Props) {
  function isVisible(question: TaxOrganizerQuestion) {
    return isQuestionVisible(question, questions, answers);
  }

  function renderQuestion(q: TaxOrganizerQuestion) {
    const value = answers.get(q.id)?.answer_value;
    const inputClass = "w-full border border-line rounded-sm px-3 py-2 text-sm";

    if (q.question_type === "boolean") {
      return (
        <div className="flex gap-2">
          {[true, false].map((choice) => (
            <button
              type="button"
              key={String(choice)}
              onClick={() => onSave(q, choice)}
              className={`text-xs font-semibold px-4 py-2 rounded-sm border ${value === choice ? "bg-ink text-white border-ink" : "bg-white text-ink border-line"}`}
            >
              {choice ? "Yes" : "No"}
            </button>
          ))}
        </div>
      );
    }

    if (q.question_type === "select") {
      return (
        <select value={String(value ?? "")} onChange={(e) => onSave(q, e.target.value)} className={inputClass}>
          <option value="">Select an answer…</option>
          {(q.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    }

    if (q.question_type === "multiselect") {
      const selected = Array.isArray(value) ? value.map(String) : [];
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {(q.options ?? []).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={(e) => onSave(q, e.target.checked ? [...selected, option] : selected.filter((item) => item !== option))}
              />
              {option}
            </label>
          ))}
        </div>
      );
    }

    if (q.question_type === "currency") {
      return <CurrencyQuestion value={String(value ?? "")} onSave={(nextValue) => onSave(q, nextValue)} />;
    }

    if (q.question_type === "textarea") {
      return <textarea defaultValue={String(value ?? "")} rows={3} placeholder={q.placeholder ?? undefined} onBlur={(e) => onSave(q, e.target.value)} className={inputClass} />;
    }

    if (q.question_type === "file") {
      return <div className="text-xs text-muted border border-dashed border-line rounded-sm px-3 py-3">Upload the requested document from the Documents area, then note the filename here.</div>;
    }

    if (q.question_type === "date") {
      return <DateQuestion value={String(value ?? "")} onSave={(nextValue) => onSave(q, nextValue)} />;
    }

    if (q.format_type) {
      return <FormattedQuestion formatType={q.format_type} value={String(value ?? "")} placeholder={q.placeholder} onSave={(nextValue) => onSave(q, nextValue)} />;
    }

    return (
      <input
        type={q.question_type === "number" ? "number" : "text"}
        defaultValue={String(value ?? "")}
        placeholder={q.placeholder ?? undefined}
        onBlur={(e) => onSave(q, e.target.value)}
        className={inputClass}
      />
    );
  }

  return (
    <div className="space-y-8">
      {sections.map((section) => {
        const sectionQuestions = questions.filter((q) => q.section_id === section.id && isVisible(q));
        if (sectionQuestions.length === 0) return null;
        const complete = sectionQuestions.filter((q) => isQuestionAnswered(answers.get(q.id)?.answer_value)).length;
        return (
          <section key={section.id}>
            <div className="border-b border-line pb-3 mb-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-slab text-lg font-bold text-ink">{section.section_title}</h2>
                  {section.section_description && <p className="text-xs text-muted mt-1">{section.section_description}</p>}
                </div>
                <span className="text-xs text-muted whitespace-nowrap">{complete} of {sectionQuestions.length} complete</span>
              </div>
              {section.estimated_minutes != null && (
                <div className="text-[11px] text-muted mt-1.5">
                  Estimated time: {section.estimated_minutes} minute{section.estimated_minutes === 1 ? "" : "s"}
                </div>
              )}
            </div>
            <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
              {sectionQuestions.map((q) => (
                <QuestionRow key={q.id} question={q} saving={savingQuestionId === q.id}>
                  {renderQuestion(q)}
                </QuestionRow>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function QuestionRow({ question: q, saving, children }: { question: TaxOrganizerQuestion; saving: boolean; children: React.ReactNode }) {
  const [showNotSure, setShowNotSure] = useState(false);
  return (
    <div className="px-5 py-4">
      <div className="text-sm font-semibold text-ink mb-1">
        {q.question_text}{q.is_required && <span className="text-brick"> *</span>}
      </div>
      {q.explanation && <p className="text-xs text-muted mb-1.5">{q.explanation}</p>}
      {q.help_text && <p className="text-xs text-muted mb-1.5">{q.help_text}</p>}
      {q.example_text && <p className="text-xs text-muted italic mb-2">Example: {q.example_text}</p>}
      {children}
      <div className="flex items-center gap-3 mt-1.5">
        {saving && <div className="text-[11px] text-muted">Saving…</div>}
        {q.not_sure_text && (
          <button type="button" onClick={() => setShowNotSure((v) => !v)} className="text-[11px] font-semibold text-blue underline">
            Not Sure?
          </button>
        )}
      </div>
      {showNotSure && q.not_sure_text && (
        <div className="text-xs text-ink bg-paperDim border border-line rounded-sm px-3 py-2 mt-1.5">{q.not_sure_text}</div>
      )}
    </div>
  );
}

function CurrencyQuestion({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  return (
    <CurrencyInput
      value={draft}
      onChange={setDraft}
      onBlur={() => onSave(draft)}
      className="max-w-xs"
    />
  );
}

function FormattedQuestion({
  formatType,
  value,
  placeholder,
  onSave,
}: {
  formatType: NonNullable<TaxOrganizerQuestion["format_type"]>;
  value: string;
  placeholder: string | null;
  onSave: (value: string) => void;
}) {
  const config = ORGANIZER_FORMAT_CONFIG[formatType];
  const [draft, setDraft] = useState(value);
  const [touched, setTouched] = useState(false);

  useEffect(() => setDraft(value), [value]);

  const showError = touched && draft.length > 0 && !config.isComplete(draft);

  return (
    <div className="max-w-xs">
      <input
        type="text"
        inputMode={config.inputMode}
        value={draft}
        placeholder={placeholder ?? config.placeholder}
        onChange={(e) => setDraft(config.mask(e.target.value))}
        onBlur={() => {
          setTouched(true);
          onSave(draft);
        }}
        className="w-full border border-line rounded-sm px-3 py-2 text-sm"
      />
      {showError && <p className="text-xs text-brick mt-1">{config.errorMessage}</p>}
    </div>
  );
}

function DateQuestion({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  return (
    <div className="max-w-xs">
      {!value && <p className="text-xs text-muted mb-1">Select a date — this field is blank until you choose one.</p>}
      <DateField value={value} onChange={onSave} />
    </div>
  );
}
