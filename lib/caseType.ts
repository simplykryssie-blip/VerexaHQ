// Maps a service's category slug to the engagement `case_type` column
// (CHECK constraint: 'tax_return' | 'bookkeeping' | 'payroll' |
// 'business_service' | 'other') so the engagement workspace can show or
// hide type-specific sections (Tax Details, IRS Notices) without staff
// having to pick a redundant "engagement type" separately from the service.
const SLUG_TO_CASE_TYPE: Record<string, string> = {
  "tax-preparation": "tax_return",
  bookkeeping: "bookkeeping",
  payroll: "payroll",
  "business-services": "business_service",
};

export function caseTypeFromCategorySlug(slug: string | null | undefined): string {
  return (slug && SLUG_TO_CASE_TYPE[slug]) || "other";
}
