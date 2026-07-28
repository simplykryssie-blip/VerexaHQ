// Shared conditional-visibility check for tax organizer questions.
// Extracted so both the question renderer and the progress/completion
// calculations (which live in the two parent pages) apply the exact same
// rule -- a question hidden by conditional logic must never count toward
// "questions remaining" either.
import type { TaxOrganizerAnswer, TaxOrganizerQuestion } from "./types";

type ConditionalRule = { mapped_field?: string; equals?: unknown; not_equals?: unknown; in?: unknown[] };

export function isQuestionVisible(
  question: TaxOrganizerQuestion,
  allQuestions: TaxOrganizerQuestion[],
  answers: Map<string, TaxOrganizerAnswer>
): boolean {
  const rule = question.conditional_logic as ConditionalRule | null;
  if (!rule?.mapped_field) return true;
  const source = allQuestions.find((candidate) => candidate.mapped_field === rule.mapped_field);
  if (!source) return true;
  const sourceValue = answers.get(source.id)?.answer_value;
  if (Object.prototype.hasOwnProperty.call(rule, "equals")) return sourceValue === rule.equals;
  if (Object.prototype.hasOwnProperty.call(rule, "not_equals")) return sourceValue !== rule.not_equals;
  // "in" supports the common case of several distinct answers all implying
  // the same follow-up (e.g. Married Filing Jointly OR Married Filing
  // Separately both mean "ask the spouse questions").
  if (Object.prototype.hasOwnProperty.call(rule, "in") && Array.isArray(rule.in)) return rule.in.includes(sourceValue);
  return Boolean(sourceValue);
}

export function isQuestionAnswered(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== "";
}
