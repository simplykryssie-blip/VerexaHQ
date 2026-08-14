// Matches the `engagements_case_type_check` constraint on the live
// `engagements` table. Kept independent of Services -- a case's type is
// its own classification, not derived from whichever service (if any)
// happens to be attached.
export const CASE_TYPES = [
  { value: "tax_return", label: "Tax Return" },
  { value: "bookkeeping", label: "Bookkeeping" },
  { value: "payroll", label: "Payroll" },
  { value: "business_service", label: "Business Service" },
  { value: "other", label: "Other" },
] as const;

export type CaseType = (typeof CASE_TYPES)[number]["value"];

export function caseTypeLabel(value: string) {
  return CASE_TYPES.find((t) => t.value === value)?.label ?? value;
}
