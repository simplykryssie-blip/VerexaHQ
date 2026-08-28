import type { OrganizerFieldType } from "@/lib/organizer/fieldTypes";

// organizer_fields.client_profile_field vocabulary -- keep in sync with the
// CHECK constraint on that column. When set, the portal-facing organizer form
// prefills this field from the client's record (via get_portal_client_snapshot)
// and, if the client edits it, proposes the change back to the client record
// (via propose_client_contact_field/propose_client_mailing_address/
// propose_client_full_name) subject to staff approval when it would overwrite
// an existing value. 'ssn' is the one exception: it always routes through
// propose_client_sensitive_field and always queues for staff review, even on
// a currently-blank field -- an encrypted, reveal-gated value is never set
// from portal input without a human looking at it first.
export type ClientProfileField =
  | "full_name"
  | "first_name"
  | "last_name"
  | "business_name"
  | "primary_email"
  | "primary_phone"
  | "mailing_address"
  | "date_of_birth"
  | "ssn";

export const CLIENT_PROFILE_FIELD_LABELS: Record<ClientProfileField, string> = {
  full_name: "Full name",
  first_name: "First name",
  last_name: "Last name",
  business_name: "Business name",
  primary_email: "Email",
  primary_phone: "Phone",
  mailing_address: "Mailing address",
  date_of_birth: "Date of birth",
  ssn: "Social Security Number",
};

// Which client_profile_field options make sense for a given organizer
// field_type. A name field's first/last parts map to the client's separate
// first_name/last_name columns as one unit (full_name) -- the client record
// has no home for a middle name or suffix, so those stay organizer-only.
// first_name/last_name are still valid values (existing fields set to them
// before the name field type existed keep working) but are no longer offered
// for new short_text fields, which now only covers business_name.
export const CLIENT_PROFILE_FIELDS_BY_TYPE: Partial<Record<OrganizerFieldType, ClientProfileField[]>> = {
  name: ["full_name"],
  email: ["primary_email"],
  phone: ["primary_phone"],
  short_text: ["business_name"],
  address: ["mailing_address"],
  date: ["date_of_birth"],
  ssn: ["ssn"],
};

export function isValidClientProfileField(value: string): value is ClientProfileField {
  return value in CLIENT_PROFILE_FIELD_LABELS;
}
