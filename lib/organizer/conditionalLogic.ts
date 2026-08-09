// Minimal single-condition scope: no AND/OR chains. organizer_fields.conditional_logic
// is real JSONB that nothing read or wrote before this builder -- this is the
// first real interpretation of it, shared by the client-facing organizer form
// and the builder's preview so they can never disagree about what a rule does.
export type ShowIfRule = { field_id: string; operator: "equals" | "not_equals"; value: string };
export type ConditionalLogic = { show_if?: ShowIfRule };

export function parseConditionalLogic(raw: unknown): ConditionalLogic {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const showIf = obj.show_if;
  if (!showIf || typeof showIf !== "object" || Array.isArray(showIf)) return {};
  const rule = showIf as Record<string, unknown>;
  if (typeof rule.field_id !== "string" || !rule.field_id) return {};
  if (rule.operator !== "equals" && rule.operator !== "not_equals") return {};
  if (typeof rule.value !== "string") return {};
  return { show_if: { field_id: rule.field_id, operator: rule.operator, value: rule.value } };
}

/** answers maps organizer_field_id -> current string value (unset/empty treated as ""). */
export function shouldShowField(logic: ConditionalLogic, answers: Record<string, string>): boolean {
  const rule = logic.show_if;
  if (!rule) return true;
  const actual = answers[rule.field_id] ?? "";
  return rule.operator === "equals" ? actual === rule.value : actual !== rule.value;
}
