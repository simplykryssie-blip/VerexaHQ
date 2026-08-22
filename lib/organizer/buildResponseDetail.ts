import { formatAddressValue, formatNameValue } from "./formatValue";

export type OrganizerFieldRow = { id: string; organizer_template_id: string; label: string; field_type: string; parent_field_id: string | null; display_order: number };
export type OrganizerAnswerRow = { id: string; organizer_response_id: string; organizer_field_id: string; value: unknown; instance_index: number };

function maskLast4(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return last4 ? `••• •• ${last4}` : "--";
}

function formatOrganizerValue(fieldType: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "--";
  if (fieldType === "address") return formatAddressValue(value) || "--";
  if (fieldType === "name") return formatNameValue(value) || "--";
  if (fieldType === "yes_no") return value === "yes" ? "Yes" : value === "no" ? "No" : String(value);
  if (fieldType === "signature" && typeof value === "object") {
    try {
      const sig = value as { typed_name?: string };
      return sig.typed_name ? `Signed by ${sig.typed_name}` : "Signed";
    } catch {
      return "Signed";
    }
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function buildFieldAnswer(field: OrganizerFieldRow, answer: OrganizerAnswerRow | undefined) {
  const maskable = (field.field_type === "ssn" || field.field_type === "ein") && answer !== undefined && answer.value !== null;
  return {
    fieldId: field.id,
    answerId: answer?.id ?? null,
    label: field.label,
    fieldType: field.field_type,
    display: maskable ? maskLast4(answer?.value) : formatOrganizerValue(field.field_type, answer?.value),
    maskable,
  };
}

export function buildOrganizerResponseDetail(responseId: string, templateId: string, allAnswers: OrganizerAnswerRow[], allFields: OrganizerFieldRow[]) {
  const templateFields = allFields.filter((f) => f.organizer_template_id === templateId);
  const responseAnswers = allAnswers.filter((a) => a.organizer_response_id === responseId);

  const topLevel = templateFields
    .filter(
      (f) => !f.parent_field_id && f.field_type !== "repeating_section" && f.field_type !== "page_break" && f.field_type !== "section" && f.field_type !== "rich_text"
    )
    .sort((a, b) => a.display_order - b.display_order)
    .map((f) => buildFieldAnswer(f, responseAnswers.find((a) => a.organizer_field_id === f.id)));

  const repeaters = templateFields
    .filter((f) => f.field_type === "repeating_section" && !f.parent_field_id)
    .sort((a, b) => a.display_order - b.display_order)
    .map((repeater) => {
      const children = templateFields.filter((f) => f.parent_field_id === repeater.id).sort((a, b) => a.display_order - b.display_order);
      const childIds = new Set(children.map((c) => c.id));
      const childAnswers = responseAnswers.filter((a) => childIds.has(a.organizer_field_id));
      const maxInstance = childAnswers.reduce((max, a) => Math.max(max, a.instance_index ?? 0), -1);
      const instances = [];
      for (let i = 0; i <= maxInstance; i++) {
        instances.push({
          index: i,
          fields: children.map((c) => buildFieldAnswer(c, childAnswers.find((a) => a.organizer_field_id === c.id && a.instance_index === i))),
        });
      }
      return { fieldId: repeater.id, label: repeater.label, instances };
    });

  return { topLevel, repeaters };
}

// Answers are only meaningful once a response has actually been filled in --
// "submitted" and "reviewed" both have real answers; anything earlier
// (not_started, in_progress) doesn't, so callers should skip detail-building
// for those rather than showing an empty shell.
export function hasOrganizerAnswers(status: string): boolean {
  return status === "submitted" || status === "reviewed";
}
