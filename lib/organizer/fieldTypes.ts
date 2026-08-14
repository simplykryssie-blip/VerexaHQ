// The full organizer_fields.field_type CHECK constraint vocabulary -- keep in
// sync with that constraint. Grouped for the field palette; groups are a UI
// concept only, not stored anywhere.
export type OrganizerFieldType =
  | "short_text"
  | "paragraph"
  | "number"
  | "currency"
  | "date"
  | "dropdown"
  | "checkbox"
  | "radio_button"
  | "multiple_choice"
  | "address"
  | "ssn"
  | "ein"
  | "file_upload"
  | "signature"
  | "repeating_section"
  | "page_break";

export const FIELD_TYPE_GROUPS: { group: string; types: { type: OrganizerFieldType; label: string }[] }[] = [
  {
    group: "Text",
    types: [
      { type: "short_text", label: "Short answer" },
      { type: "paragraph", label: "Long answer" },
      { type: "number", label: "Number" },
      { type: "currency", label: "Currency" },
      { type: "date", label: "Date" },
    ],
  },
  {
    group: "Choice",
    types: [
      { type: "dropdown", label: "Dropdown" },
      { type: "radio_button", label: "Radio buttons" },
      { type: "multiple_choice", label: "Multiple choice" },
      { type: "checkbox", label: "Checkbox" },
    ],
  },
  {
    group: "Sensitive",
    types: [
      { type: "ssn", label: "SSN" },
      { type: "ein", label: "EIN" },
      { type: "address", label: "Address" },
      { type: "signature", label: "Signature" },
    ],
  },
  {
    group: "Upload",
    types: [{ type: "file_upload", label: "Document upload" }],
  },
  {
    group: "Structure",
    types: [
      { type: "repeating_section", label: "Repeating section" },
      { type: "page_break", label: "Page break" },
    ],
  },
];

export const FIELD_TYPE_LABELS: Record<OrganizerFieldType, string> = Object.fromEntries(
  FIELD_TYPE_GROUPS.flatMap((g) => g.types.map((t) => [t.type, t.label]))
) as Record<OrganizerFieldType, string>;

export const CHOICE_FIELD_TYPES = new Set<OrganizerFieldType>(["dropdown", "radio_button", "multiple_choice"]);

export function isValidFieldType(value: string): value is OrganizerFieldType {
  return value in FIELD_TYPE_LABELS;
}
