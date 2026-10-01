// Pure client-side validation for the digital-product public intake form
// (/dpi/[token]) -- a UX nicety only. The authoritative, security-relevant
// validation (required fields, conditional-field requirements, the
// disclaimer acknowledgment, and the file-path trust boundary) lives in
// the submit_digital_product_intake() Postgres function and is re-checked
// there regardless of what this module allows through.
export type IntakeFieldDef = {
  field_key: string;
  field_type: string;
  label: string;
  is_required: boolean;
  conditional_on_field_key: string | null;
  conditional_on_values: string[] | null;
};

export type IntakeAnswerValue = string | string[];

export function isFieldActive(field: IntakeFieldDef, answers: Record<string, IntakeAnswerValue>): boolean {
  if (!field.conditional_on_field_key || !field.conditional_on_values) return true;
  const value = answers[field.conditional_on_field_key];
  if (typeof value !== "string") return false;
  return field.conditional_on_values.includes(value);
}

export function validateIntakeAnswers(
  fields: IntakeFieldDef[],
  answers: Record<string, IntakeAnswerValue>
): { ok: true } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (field.field_type === "static_disclaimer") continue;
    if (!isFieldActive(field, answers)) continue;
    if (!field.is_required) continue;

    const value = answers[field.field_key];
    if (field.field_type === "checkbox_acknowledgment") {
      if (value !== "true") errors[field.field_key] = "This must be acknowledged to continue.";
    } else if (field.field_type === "file_upload") {
      if (!Array.isArray(value) || value.length === 0) errors[field.field_key] = "At least one file is required.";
    } else if (typeof value !== "string" || value.trim() === "") {
      errors[field.field_key] = "This field is required.";
    }
  }

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors };
}
