import { parseConditionalLogic, shouldShowField } from "./conditionalLogic";
import { formatAddressValue, formatNameValue } from "./formatValue";
import { NON_ANSWERABLE_FIELD_TYPES } from "./fieldTypes";

export type OrganizerReviewStatus = "Pending" | "In Review" | "Approved" | "Rejected" | "Corrections Requested";

export type ReviewFieldRow = {
  id: string;
  label: string;
  help_text: string | null;
  field_type: string;
  is_required: boolean;
  options: unknown;
  parent_field_id: string | null;
  display_order: number;
  conditional_logic: unknown;
  client_profile_field: string | null;
};

export type ReviewAnswerRow = {
  id: string;
  organizer_field_id: string;
  value: unknown;
  instance_index: number;
  review_status: OrganizerReviewStatus | null;
  review_note: string | null;
};

export type ReviewPendingChangeRow = {
  id: string;
  organizer_field_id: string | null;
  target_column: string;
  old_value: string | null;
  new_value: string;
  new_value_last4: string | null;
};

/** A per-question status distinct from OrganizerReviewStatus -- the extra values cover states that have no per-answer decision recorded yet. */
export type ReviewQuestionStatus = "not_applicable" | "unanswered" | "optional_blank" | "needs_review" | OrganizerReviewStatus;

export type ReviewQuestionItem = {
  fieldId: string;
  label: string;
  helpText: string | null;
  fieldType: string;
  isRequired: boolean;
  answerId: string | null;
  display: string;
  maskable: boolean;
  status: ReviewQuestionStatus;
  reviewNote: string | null;
  pendingChange: ReviewPendingChangeRow | null;
};

export type ReviewRepeaterGroup = {
  fieldId: string;
  label: string;
  helpText: string | null;
  instances: { index: number; items: ReviewQuestionItem[] }[];
};

export type ReviewSectionEntry = { kind: "question"; item: ReviewQuestionItem } | { kind: "repeater"; group: ReviewRepeaterGroup };

export type ReviewSection = {
  id: string;
  label: string;
  entries: ReviewSectionEntry[];
  attentionCount: number; // unanswered required + Corrections Requested + Rejected, among visible items -- an answered item with no explicit decision is treated as approved by default, not "needs attention"
  totalVisible: number;
  allDecided: boolean; // no visible item in this section needs attention
};

function maskLast4(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return last4 ? `••• •• ${last4}` : "--";
}

function formatOrganizerValue(fieldType: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (fieldType === "address") return formatAddressValue(value) || "";
  if (fieldType === "name") return formatNameValue(value) || "";
  if (fieldType === "yes_no") return value === "yes" ? "Yes" : value === "no" ? "No" : String(value);
  if (fieldType === "signature" && typeof value === "object") {
    const sig = value as { typed_name?: string };
    return sig.typed_name ? `Signed by ${sig.typed_name}` : "Signed";
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function toComparableString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}

// An answered, visible question with no persisted per-answer decision is
// "needs_review" here only as an internal computed name -- the review
// workspace displays and treats it as implicitly Approved. Everything is
// considered fine unless the reviewer explicitly flags it (via the
// Needs Info compose panel) or the whole response is denied; there is no
// per-question approve action to click.
function questionStatus(
  visible: boolean,
  isRequired: boolean,
  hasAnswer: boolean,
  reviewStatus: OrganizerReviewStatus | null
): ReviewQuestionStatus {
  if (!visible) return "not_applicable";
  if (!hasAnswer) return isRequired ? "unanswered" : "optional_blank";
  if (reviewStatus) return reviewStatus;
  return "needs_review";
}

function buildQuestionItem(
  field: ReviewFieldRow,
  answer: ReviewAnswerRow | undefined,
  visible: boolean,
  pendingChange: ReviewPendingChangeRow | undefined
): ReviewQuestionItem {
  const maskable = (field.field_type === "ssn" || field.field_type === "ein") && answer !== undefined && answer.value !== null && answer.value !== "";
  const hasAnswer = answer !== undefined && answer.value !== null && answer.value !== "";
  return {
    fieldId: field.id,
    label: field.label,
    helpText: field.help_text,
    fieldType: field.field_type,
    isRequired: field.is_required,
    answerId: answer?.id ?? null,
    display: maskable ? maskLast4(answer?.value) : formatOrganizerValue(field.field_type, answer?.value),
    maskable,
    status: questionStatus(visible, field.is_required, hasAnswer, answer?.review_status ?? null),
    reviewNote: answer?.review_note ?? null,
    pendingChange: pendingChange ?? null,
  };
}

const ATTENTION_STATUSES = new Set<ReviewQuestionStatus>(["unanswered", "Corrections Requested", "Rejected"]);

/**
 * Groups a template's fields into left-nav sections (split on field_type ===
 * "section", the same structural marker the builder already uses -- see
 * fieldTypes.ts), computing each visible question's review status along the
 * way. Conditional-logic visibility is evaluated against the top-level
 * (instance_index 0) answers, same convention the client-facing organizer
 * forms already use; a repeating_section instance additionally sees its own
 * row's answers merged in, so a rule referencing a sibling field within the
 * same repeated instance still resolves correctly.
 */
export function buildReviewSections(
  fields: ReviewFieldRow[],
  answers: ReviewAnswerRow[],
  pendingChanges: ReviewPendingChangeRow[]
): ReviewSection[] {
  const sorted = [...fields].sort((a, b) => a.display_order - b.display_order);
  const topLevel = sorted.filter((f) => !f.parent_field_id);

  const topAnswersByField = new Map<string, ReviewAnswerRow>();
  for (const a of answers) {
    if (a.instance_index === 0 && !topAnswersByField.has(a.organizer_field_id)) topAnswersByField.set(a.organizer_field_id, a);
  }
  const flatTopAnswers: Record<string, string> = {};
  for (const [fieldId, a] of topAnswersByField) flatTopAnswers[fieldId] = toComparableString(a.value);

  const pendingByField = new Map<string, ReviewPendingChangeRow>();
  for (const pc of pendingChanges) {
    if (pc.organizer_field_id) pendingByField.set(pc.organizer_field_id, pc);
  }

  const answersByFieldAndInstance = new Map<string, ReviewAnswerRow>();
  for (const a of answers) answersByFieldAndInstance.set(`${a.organizer_field_id}:${a.instance_index}`, a);

  const sections: ReviewSection[] = [];
  let current: ReviewSection = { id: "general", label: "General", entries: [], attentionCount: 0, totalVisible: 0, allDecided: true };
  let hasOpenedRealSection = false;

  function tallyStatus(visible: boolean, status: ReviewQuestionStatus) {
    if (!visible || status === "not_applicable") return;
    current.totalVisible += 1;
    if (ATTENTION_STATUSES.has(status)) {
      current.attentionCount += 1;
      current.allDecided = false;
    }
  }

  for (const field of topLevel) {
    if (field.field_type === "section") {
      if (hasOpenedRealSection || current.entries.length > 0) sections.push(current);
      current = { id: field.id, label: field.label || "Section", entries: [], attentionCount: 0, totalVisible: 0, allDecided: true };
      hasOpenedRealSection = true;
      continue;
    }
    if (NON_ANSWERABLE_FIELD_TYPES.has(field.field_type as never)) continue;

    const visible = shouldShowField(parseConditionalLogic(field.conditional_logic), flatTopAnswers);

    if (field.field_type === "repeating_section") {
      const children = sorted.filter((f) => f.parent_field_id === field.id);
      const childIds = new Set(children.map((c) => c.id));
      const maxInstance = answers.reduce((max, a) => (childIds.has(a.organizer_field_id) ? Math.max(max, a.instance_index) : max), -1);
      const instances = [];
      for (let i = 0; i <= maxInstance; i++) {
        const instanceAnswers: Record<string, string> = { ...flatTopAnswers };
        for (const c of children) {
          const a = answersByFieldAndInstance.get(`${c.id}:${i}`);
          if (a) instanceAnswers[c.id] = toComparableString(a.value);
        }
        const items = children.map((c) => {
          const a = answersByFieldAndInstance.get(`${c.id}:${i}`);
          const childVisible = visible && shouldShowField(parseConditionalLogic(c.conditional_logic), instanceAnswers);
          const item = buildQuestionItem(c, a, childVisible, pendingByField.get(c.id));
          tallyStatus(childVisible, item.status);
          return item;
        });
        instances.push({ index: i, items });
      }
      current.entries.push({ kind: "repeater", group: { fieldId: field.id, label: field.label, helpText: field.help_text, instances } });
      continue;
    }

    const answer = topAnswersByField.get(field.id);
    const item = buildQuestionItem(field, answer, visible, pendingByField.get(field.id));
    current.entries.push({ kind: "question", item });
    tallyStatus(visible, item.status);
  }
  sections.push(current);

  return sections.filter((s) => s.entries.length > 0);
}
