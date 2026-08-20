import type { OrganizerFieldType } from "@/lib/organizer/fieldTypes";

// organizer_fields.relationship_role vocabulary -- keep in sync with the
// CHECK constraint on that column. When a submitted organizer response has
// answers for these fields, a client_relationships row is created/updated
// automatically (labeled spouse or dependent) -- see
// sync_client_relationships_from_organizer_submission(). Fields inside a
// repeating section (e.g. "Dependents") get one relationship per repeat
// instance; top-level fields (spouse) map to a single relationship.
export type RelationshipRole =
  | "spouse_full_name"
  | "spouse_dob"
  | "spouse_ssn"
  | "dependent_full_name"
  | "dependent_dob"
  | "dependent_ssn"
  | "dependent_relationship_type"
  | "dependent_relationship_other";

export const RELATIONSHIP_ROLE_LABELS: Record<RelationshipRole, string> = {
  spouse_full_name: "Spouse -- full name",
  spouse_dob: "Spouse -- date of birth",
  spouse_ssn: "Spouse -- SSN/ITIN",
  dependent_full_name: "Dependent -- full name",
  dependent_dob: "Dependent -- date of birth",
  dependent_ssn: "Dependent -- SSN/ITIN",
  dependent_relationship_type: "Dependent -- relationship to client",
  dependent_relationship_other: "Dependent -- relationship, if \"Other\"",
};

// Which relationship_role options make sense for a given organizer
// field_type -- e.g. only a "name" field can capture a full name, only a
// "date" field a date of birth.
export const RELATIONSHIP_ROLES_BY_TYPE: Partial<Record<OrganizerFieldType, RelationshipRole[]>> = {
  name: ["spouse_full_name", "dependent_full_name"],
  date: ["spouse_dob", "dependent_dob"],
  ssn: ["spouse_ssn", "dependent_ssn"],
  dropdown: ["dependent_relationship_type"],
  short_text: ["dependent_relationship_other"],
};

export function isValidRelationshipRole(value: string): value is RelationshipRole {
  return value in RELATIONSHIP_ROLE_LABELS;
}
