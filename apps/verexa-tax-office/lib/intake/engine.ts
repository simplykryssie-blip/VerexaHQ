import type { Tables } from "@/types/database";

export type FormSectionRow = Tables<"form_sections">;
export type FormFieldRow = Tables<"form_fields">;
export type FormConditionRow = Tables<"form_conditions">;

// Some repeatable sections in the seeded system template omit
// settings.entity_type (e.g. "self_employment"). Where the section_key
// unambiguously maps to one real public.intake_entity_type value, we fill
// the gap here rather than inventing a new enum value or leaving the
// section unsavable.
const SECTION_KEY_ENTITY_TYPE_FALLBACK: Record<string, string> = {
  self_employment: "business",
};

export function sectionEntityType(section: FormSectionRow): string | null {
  const settings = (section.settings ?? {}) as Record<string, unknown>;
  const configured = typeof settings.entity_type === "string" ? settings.entity_type : null;
  return configured ?? SECTION_KEY_ENTITY_TYPE_FALLBACK[section.section_key] ?? null;
}

export function isHouseholdSection(section: FormSectionRow): boolean {
  return section.section_key === "dependents";
}

export function sectionDefaultVisible(section: FormSectionRow): boolean {
  const settings = (section.settings ?? {}) as Record<string, unknown>;
  return settings.default_visible !== false;
}

export function sectionAddButtonLabel(section: FormSectionRow): string {
  const settings = (section.settings ?? {}) as Record<string, unknown>;
  return typeof settings.add_button_label === "string" ? settings.add_button_label : "Add another";
}

export function sectionIsStaffOnly(section: FormSectionRow): boolean {
  const settings = (section.settings ?? {}) as Record<string, unknown>;
  return settings.staff_only === true;
}

function coerceComparable(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    // arrays (multiple_choice) compare via contains/in below, not directly
    return null;
  }
  return value as string | number | boolean;
}

export function evaluateCondition(
  operator: FormConditionRow["operator"],
  comparisonValue: unknown,
  actualValue: unknown,
): boolean {
  const actual = actualValue;
  switch (operator) {
    case "is_empty":
      return actual === null || actual === undefined || actual === "" || (Array.isArray(actual) && actual.length === 0);
    case "is_not_empty":
      return !(actual === null || actual === undefined || actual === "" || (Array.isArray(actual) && actual.length === 0));
    case "equals":
      return coerceComparable(actual) === coerceComparable(comparisonValue);
    case "not_equals":
      return coerceComparable(actual) !== coerceComparable(comparisonValue);
    case "contains":
      if (Array.isArray(actual)) return actual.includes(comparisonValue as never);
      if (typeof actual === "string") return actual.includes(String(comparisonValue ?? ""));
      return false;
    case "not_contains":
      if (Array.isArray(actual)) return !actual.includes(comparisonValue as never);
      if (typeof actual === "string") return !actual.includes(String(comparisonValue ?? ""));
      return true;
    case "in":
      return Array.isArray(comparisonValue) ? comparisonValue.includes(actual as never) : false;
    case "not_in":
      return Array.isArray(comparisonValue) ? !comparisonValue.includes(actual as never) : true;
    case "greater_than":
      return Number(actual) > Number(comparisonValue);
    case "greater_than_or_equal":
      return Number(actual) >= Number(comparisonValue);
    case "less_than":
      return Number(actual) < Number(comparisonValue);
    case "less_than_or_equal":
      return Number(actual) <= Number(comparisonValue);
    default:
      return true;
  }
}

/** Evaluates every condition whose target is this section/field against a flat
 * field_key -> value lookup. "hide" actions invert their match; anything with
 * no matching conditions is visible by default. */
export function isVisible(
  conditions: FormConditionRow[],
  values: Record<string, unknown>,
  fieldsByKey: Map<string, FormFieldRow>,
  target: { sectionId?: string; fieldId?: string },
): boolean {
  const relevant = conditions.filter(
    (c) => (target.sectionId && c.target_section_id === target.sectionId) || (target.fieldId && c.target_field_id === target.fieldId),
  );
  if (relevant.length === 0) return true;

  const groups = new Map<string, FormConditionRow[]>();
  for (const c of relevant) {
    const key = c.logical_group ?? "and";
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  // Conditions in the same logical_group are AND'ed; different groups are OR'ed.
  return Array.from(groups.values()).some((group) =>
    group.every((c) => {
      const sourceField = Array.from(fieldsByKey.values()).find((f) => f.id === c.source_field_id);
      const actual = sourceField ? values[sourceField.field_key] : undefined;
      const matched = evaluateCondition(c.operator, c.comparison_value, actual);
      return c.action === "hide" ? !matched : matched;
    }),
  );
}

export type ProgressInput = {
  visibleRequiredFieldKeys: string[];
  answeredFieldKeys: Set<string>;
};

export function computeProgressPercent({ visibleRequiredFieldKeys, answeredFieldKeys }: ProgressInput): number {
  if (visibleRequiredFieldKeys.length === 0) return 100;
  const answered = visibleRequiredFieldKeys.filter((k) => answeredFieldKeys.has(k)).length;
  return Math.round((answered / visibleRequiredFieldKeys.length) * 100);
}
