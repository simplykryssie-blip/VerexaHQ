// Shared conditional-visibility check for organizer fields. Extracted so
// both the field renderer and the progress/completion calculations apply
// the exact same rule -- a field hidden by conditional logic must never
// count toward "fields remaining" either.
//
// organizer_fields.conditional_logic is live but every seeded row currently
// has it set to {} (no template author has used it yet — verified against
// the live database), so there's no existing convention to preserve. This
// defines one going forward: { source_field_id, equals | not_equals | in }.
// source_field_id references another organizer_fields.id directly, since
// the old system's "mapped_field" (a free-text key onto Client columns)
// has no live equivalent.
import type { OrganizerField, OrganizerResponseAnswer } from "./types";

type ConditionalRule = { source_field_id?: string; equals?: unknown; not_equals?: unknown; in?: unknown[] };

export function isFieldVisible(
  field: OrganizerField,
  allFields: OrganizerField[],
  answers: Map<string, OrganizerResponseAnswer>,
): boolean {
  const rule = field.conditional_logic as ConditionalRule | null;
  if (!rule?.source_field_id) return true;
  const source = allFields.find((candidate) => candidate.id === rule.source_field_id);
  if (!source) return true;
  const sourceValue = answers.get(source.id)?.value;
  if (Object.prototype.hasOwnProperty.call(rule, "equals")) return sourceValue === rule.equals;
  if (Object.prototype.hasOwnProperty.call(rule, "not_equals")) return sourceValue !== rule.not_equals;
  if (Object.prototype.hasOwnProperty.call(rule, "in") && Array.isArray(rule.in)) return rule.in.includes(sourceValue);
  return Boolean(sourceValue);
}

export function isFieldAnswered(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== "";
}
