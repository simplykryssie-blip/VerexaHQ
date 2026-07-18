"use client";

import { useEffect, useState } from "react";
import CurrencyInput from "@/components/CurrencyInput";
import type { TaxOrganizerAnswer, TaxOrganizerQuestion, TaxOrganizerSection } from "@/lib/types";

type Props = {
  sections: TaxOrganizerSection[];
  questions: TaxOrganizerQuestion[];
  answers: Map<string, TaxOrganizerAnswer>;
  savingQuestionId: string | null;
  onSave: (question: TaxOrganizerQuestion, value: unknown) => void;
};

function isAnswered(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== "";
}

export default function OrganizerQuestionnaire({ sections, questions, answers, savingQuestionId, onSave }: Props) {
  function isVisible(question: TaxOrganizerQuestion) {
    const rule = question.conditional_logic as { mapped_field?: string; equals?: unknown; not_equals?: unknown } | null;
    if (!rule?.mapped_field) return true;
    const source = questions.find((candidate) => candidate.mapped_field === rule.mapped_field);
    if (!source) return true;
    const sourceValue = answers.get(source.id)?.answer_value;
    if (Object.prototype.hasOwnProperty.call(rule, "equals")) return sourceValue === rule.equals;
    if (Object.prototype.hasOwnProperty.call(rule, "not_equals")) return sourceValue !== rule.not_equals;
    return Boolean(sourceValue);
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
      return <textarea defaultValue={String(value ?? "")} rows={3} onBlur={(e) => onSave(q, e.target.value)} className={inputClass} />;
    }

    if (q.question_type === "file") {
      return <div className="text-xs text-muted border border-dashed border-line rounded-sm px-3 py-3">Upload the requested document from the Documents area, then note the filename here.</div>;
    }

    return (
      <input
        type={q.question_type === "date" ? "date" : q.question_type === "number" ? "number" : "text"}
        defaultValue={String(value ?? "")}
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
        const complete = sectionQuestions.filter((q) => isAnswered(answers.get(q.id)?.answer_value)).length;
        return (
          <section key={section.id}>
            <div className="border-b border-line pb-3 mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="font-slab text-lg font-bold text-ink">{section.section_title}</h2>
                {section.section_description && <p className="text-xs text-muted mt-1">{section.section_description}</p>}
              </div>
              <span className="text-xs text-muted whitespace-nowrap">{complete} of {sectionQuestions.length} complete</span>
            </div>
            <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
              {sectionQuestions.map((q) => (
                <div key={q.id} className="px-5 py-4">
                  <div className="text-sm font-semibold text-ink mb-2">
                    {q.question_text}{q.is_required && <span className="text-brick"> *</span>}
                  </div>
                  {q.help_text && <div className="text-xs text-muted mb-2">{q.help_text}</div>}
                  {renderQuestion(q)}
                  {savingQuestionId === q.id && <div className="text-[11px] text-muted mt-1">Saving…</div>}
                </div>
              ))}
            </div>
          </section>
        );
      })}
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
