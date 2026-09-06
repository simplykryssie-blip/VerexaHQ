import type { OrganizerFieldType } from "@/lib/organizer/fieldTypes";

// organizer_fields.irs_8821_role vocabulary -- sibling to relationshipRoles.ts,
// same mechanism (a tagged field, when its organizer is submitted, feeds
// something elsewhere automatically). Here it feeds the "New IRS
// Authorization" form's prefill instead of client_relationships. Kept
// deliberately narrow: only the two things a client's own organizer answer
// could plausibly already contain -- which years/periods, and what they
// need help with. Tax-matter *type* and *form number* stay staff-only
// judgment calls, not taggable.
export type Irs8821Role = "tax_years_periods" | "specific_tax_matters";

export const IRS_8821_ROLE_LABELS: Record<Irs8821Role, string> = {
  tax_years_periods: "IRS 8821 -- tax year(s)/period(s) needed",
  specific_tax_matters: "IRS 8821 -- specific tax matters description",
};

// Which irs_8821_role options make sense for a given organizer field_type.
export const IRS_8821_ROLES_BY_TYPE: Partial<Record<OrganizerFieldType, Irs8821Role[]>> = {
  short_text: ["tax_years_periods", "specific_tax_matters"],
  paragraph: ["specific_tax_matters"],
};

export function isValidIrs8821Role(value: string): value is Irs8821Role {
  return value in IRS_8821_ROLE_LABELS;
}
