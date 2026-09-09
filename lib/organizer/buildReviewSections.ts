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

/** A field+instance currently flagged for more information, whether that flag is still an unsent draft or already sent to the client. */
export type OpenInfoRequestItemRow = {
  id: string;
  organizer_field_id: string;
  instance_index: number;
  status: "pending" | "client_responded";
  note: string | null;
};

/** A per-question status distinct from OrganizerReviewStatus -- the extra values cover states that have no per-answer decision recorded yet. */
export type ReviewQuestionStatus = "not_applicable" | "unanswered" | "optional_blank" | "needs_review" | "Awaiting Review" | OrganizerReviewStatus;

export type ReviewQuestionItem = {
  fieldId: string;
  instanceIndex: number;
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
  /** The open (pending/client_responded) organizer_information_request_items row for this field+instance, if any -- drives the inline flag/unflag control. */
  infoRequestItemId: string | null;
  infoRequestItemStatus: "pending" | "client_responded" | null;
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

export function maskLast4(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return last4 ? `••• •• ${last4}` : "--";
}

export function formatOrganizerValue(fieldType: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (fieldType === "address") return formatAddressValue(value) || "";
  if (fieldType === "name") return formatNameValue(value) || "";
  if (fieldType === "yes_no") return value === "yes" ? "Yes" : value === "no" ? "No" : String(value);
  if (fieldType === "signature" && typeof value === "object") {
    const sig = value as { typed_name?: string; signature_image_path?: string };
    if (sig.typed_name) return `Signed by ${sig.typed_name}`;
    return sig.signature_image_path ? "Signed (drawn signature)" : "Signed";
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
  reviewStatus: OrganizerReviewStatus | null,
  openItemStatus: "pending" | "client_responded" | null
): ReviewQuestionStatus {
  // An open information-request item always wins, even over a field that's
  // conditionally hidden by the client's own answers -- e.g. a client who
  // only checked "W-2" income but is actually engaged for a Schedule C
  // return needs a way to be asked about the business section their
  // answers hid. Checked before visibility so a flagged-while-hidden field
  // neither disappears again on refresh nor silently blocks the flag in
  // the first place (see canFlag in ReviewWorkspace.tsx). A client response
  // is its own status ("Awaiting Review") distinct from still-waiting-on-
  // the-client ("Corrections Requested") so the two read differently in
  // the reviewer's UI.
  if (openItemStatus === "client_responded") return "Awaiting Review";
  if (openItemStatus === "pending") return "Corrections Requested";
  if (!visible) return "not_applicable";
  if (!hasAnswer) return isRequired ? "unanswered" : "optional_blank";
  if (reviewStatus) return reviewStatus;
  return "needs_review";
}

function buildQuestionItem(
  field: ReviewFieldRow,
  answer: ReviewAnswerRow | undefined,
  visible: boolean,
  instanceIndex: number,
  pendingChange: ReviewPendingChangeRow | undefined,
  openItem: OpenInfoRequestItemRow | undefined
): ReviewQuestionItem {
  const maskable = (field.field_type === "ssn" || field.field_type === "ein") && answer !== undefined && answer.value !== null && answer.value !== "";
  const hasAnswer = answer !== undefined && answer.value !== null && answer.value !== "";
  return {
    fieldId: field.id,
    instanceIndex,
    label: field.label,
    helpText: field.help_text,
    fieldType: field.field_type,
    isRequired: field.is_required,
    answerId: answer?.id ?? null,
    display: maskable ? maskLast4(answer?.value) : formatOrganizerValue(field.field_type, answer?.value),
    maskable,
    status: questionStatus(visible, field.is_required, hasAnswer, answer?.review_status ?? null, openItem?.status ?? null),
    reviewNote: openItem?.note ?? answer?.review_note ?? null,
    pendingChange: pendingChange ?? null,
    infoRequestItemId: openItem?.id ?? null,
    infoRequestItemStatus: openItem?.status ?? null,
  };
}

const ATTENTION_STATUSES = new Set<ReviewQuestionStatus>(["unanswered", "Corrections Requested", "Awaiting Review", "Rejected"]);

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
  pendingChanges: ReviewPendingChangeRow[],
  openInfoItems: OpenInfoRequestItemRow[] = []
): ReviewSection[] {
  const sorted = [...fields].sort((a, b) => a.display_order - b.display_order);
  const topLevel = sorted.filter((f) => !f.parent_field_id);

  const openItemByFieldInstance = new Map<string, OpenInfoRequestItemRow>();
  for (const item of openInfoItems) openItemByFieldInstance.set(`${item.organizer_field_id}:${item.instance_index}`, item);

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

  // Driven purely by the computed status, not raw visibility -- a field
  // conditionally hidden by the client's own answers but flagged anyway
  // (see questionStatus above) reports a real status, not "not_applicable",
  // and should count toward the section's attention indicator same as any
  // other flagged question.
  function tallyStatus(status: ReviewQuestionStatus) {
    if (status === "not_applicable") return;
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
          const item = buildQuestionItem(c, a, childVisible, i, pendingByField.get(c.id), openItemByFieldInstance.get(`${c.id}:${i}`));
          tallyStatus(item.status);
          return item;
        });
        instances.push({ index: i, items });
      }
      current.entries.push({ kind: "repeater", group: { fieldId: field.id, label: field.label, helpText: field.help_text, instances } });
      continue;
    }

    const answer = topAnswersByField.get(field.id);
    const item = buildQuestionItem(field, answer, visible, 0, pendingByField.get(field.id), openItemByFieldInstance.get(`${field.id}:0`));
    current.entries.push({ kind: "question", item });
    tallyStatus(item.status);
  }
  sections.push(current);

  return sections.filter((s) => s.entries.length > 0);
}

export type AwaitingReviewItem = {
  id: string;
  fieldLabel: string;
  currentDisplay: string;
  proposedDisplay: string;
  note: string | null;
  createdAt: string;
  /** Whether this was a correction to an already-answered question (true) vs a client's answer to a question that was blank when flagged (false). */
  wasAnsweredWhenFlagged: boolean;
};

/** Client-submitted corrections and new answers to flagged questions, awaiting a staff approve/reject decision. */
export function buildAwaitingReviewItems(
  fields: ReviewFieldRow[],
  answers: ReviewAnswerRow[],
  items: {
    id: string;
    organizer_field_id: string;
    instance_index: number;
    status: string;
    was_answered_when_flagged: boolean;
    proposed_value: unknown;
    note: string | null;
    created_at: string;
  }[]
): AwaitingReviewItem[] {
  const fieldsById = new Map(fields.map((f) => [f.id, f]));
  const answersByFieldAndInstance = new Map<string, ReviewAnswerRow>();
  for (const a of answers) answersByFieldAndInstance.set(`${a.organizer_field_id}:${a.instance_index}`, a);

  return items
    .filter((i) => i.status === "client_responded")
    .map((i) => {
      const field = fieldsById.get(i.organizer_field_id);
      const fieldType = field?.field_type ?? "short_text";
      const maskable = fieldType === "ssn" || fieldType === "ein";
      const currentAnswer = answersByFieldAndInstance.get(`${i.organizer_field_id}:${i.instance_index}`);
      const parentLabel = field?.parent_field_id ? fieldsById.get(field.parent_field_id)?.label : null;
      return {
        id: i.id,
        fieldLabel: parentLabel ? `${parentLabel} ${i.instance_index + 1} -- ${field?.label ?? "Question"}` : field?.label ?? "Question",
        currentDisplay: maskable ? maskLast4(currentAnswer?.value) : formatOrganizerValue(fieldType, currentAnswer?.value),
        proposedDisplay: maskable ? maskLast4(i.proposed_value) : formatOrganizerValue(fieldType, i.proposed_value),
        note: i.note,
        createdAt: i.created_at,
        wasAnsweredWhenFlagged: i.was_answered_when_flagged,
      };
    });
}
