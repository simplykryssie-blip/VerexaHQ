// organizer_fields.conditional_logic is real JSONB. This is the shared
// interpretation of it, used by both the client-facing organizer forms and
// the builder's own preview, so they can never disagree about what a rule
// does. Supports multiple conditions per field, combined with AND ("all")
// or OR ("any") -- there's no separate "skip" concept: skipping a question
// is just not showing it, so hide/show covers both.
export type LogicOperator = "equals" | "not_equals" | "includes" | "not_includes" | "is_answered" | "is_blank";

export type Rule = { field_id: string; operator: LogicOperator; value: string };

export type ShowIf = { match: "all" | "any"; conditions: Rule[] };

export type ConditionalLogic = { show_if?: ShowIf };

const OPERATORS: LogicOperator[] = ["equals", "not_equals", "includes", "not_includes", "is_answered", "is_blank"];

function parseRule(raw: unknown): Rule | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.field_id !== "string" || !obj.field_id) return null;
  if (typeof obj.operator !== "string" || !OPERATORS.includes(obj.operator as LogicOperator)) return null;
  const value = typeof obj.value === "string" ? obj.value : "";
  return { field_id: obj.field_id, operator: obj.operator as LogicOperator, value };
}

export function parseConditionalLogic(raw: unknown): ConditionalLogic {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const showIf = obj.show_if;
  if (!showIf || typeof showIf !== "object" || Array.isArray(showIf)) return {};
  const rec = showIf as Record<string, unknown>;

  // Current shape: { match, conditions: Rule[] }.
  if (Array.isArray(rec.conditions)) {
    const conditions = rec.conditions.map(parseRule).filter((r): r is Rule => r !== null);
    if (conditions.length === 0) return {};
    const match = rec.match === "any" ? "any" : "all";
    return { show_if: { match, conditions } };
  }

  // Legacy shape from before multi-condition support: a single rule inline,
  // no match/conditions wrapper. Read old data the same as a 1-condition "all" group.
  const legacy = parseRule(rec);
  if (legacy) return { show_if: { match: "all", conditions: [legacy] } };

  return {};
}

function evaluateRule(rule: Rule, answers: Record<string, string>): boolean {
  const raw = answers[rule.field_id] ?? "";
  switch (rule.operator) {
    case "equals":
      return raw === rule.value;
    case "not_equals":
      return raw !== rule.value;
    case "includes":
      return raw.split(",").map((v) => v.trim()).filter(Boolean).includes(rule.value);
    case "not_includes":
      return !raw.split(",").map((v) => v.trim()).filter(Boolean).includes(rule.value);
    case "is_answered":
      return raw.trim() !== "";
    case "is_blank":
      return raw.trim() === "";
  }
}

/** answers maps organizer_field_id -> current string value (unset/empty treated as ""). */
export function shouldShowField(logic: ConditionalLogic, answers: Record<string, string>): boolean {
  const showIf = logic.show_if;
  if (!showIf || showIf.conditions.length === 0) return true;
  return showIf.match === "any"
    ? showIf.conditions.some((r) => evaluateRule(r, answers))
    : showIf.conditions.every((r) => evaluateRule(r, answers));
}
