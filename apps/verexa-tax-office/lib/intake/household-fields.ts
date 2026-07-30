import type { Tables } from "@/types/database";

type HouseholdPersonRow = Tables<"intake_household_people">;
type HouseholdColumn = keyof Pick<
  HouseholdPersonRow,
  "first_name" | "last_name" | "middle_name" | "suffix" | "date_of_birth" | "ssn_last4" | "relationship" | "months_in_home" | "is_student" | "is_disabled" | "occupation" | "identity_pin_last4"
>;

// The seeded "dependents" section (no settings.entity_type — see
// lib/intake/engine.ts) uses field_keys that don't literally match
// intake_household_people's dedicated columns. This maps the common ones so
// dependent data lands in real, queryable columns instead of only `details`;
// anything not listed here still round-trips through `details` jsonb.
export const HOUSEHOLD_FIELD_COLUMN_MAP: Partial<Record<string, HouseholdColumn>> = {
  dependent_full_name: "first_name",
  dependent_first_name: "first_name",
  dependent_last_name: "last_name",
  dependent_middle_name: "middle_name",
  dependent_suffix: "suffix",
  dependent_dob: "date_of_birth",
  dependent_date_of_birth: "date_of_birth",
  dependent_ssn_last4: "ssn_last4",
  dependent_relationship: "relationship",
  dependent_months_lived_with_you: "months_in_home",
  dependent_months_in_home: "months_in_home",
  dependent_student: "is_student",
  dependent_disabled: "is_disabled",
  dependent_occupation: "occupation",
  dependent_identity_pin: "identity_pin_last4",
};

export function splitHouseholdPersonUpdate(fieldKey: string, value: unknown) {
  const column = HOUSEHOLD_FIELD_COLUMN_MAP[fieldKey];
  if (column) return { column, value };
  return null;
}

export function householdPersonDisplayName(person: HouseholdPersonRow): string {
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  return name || (person.relationship ? `Unnamed ${person.relationship}` : "New household member");
}
