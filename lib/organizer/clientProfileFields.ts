import type { OrganizerFieldType } from "@/lib/organizer/fieldTypes";

// organizer_fields.client_profile_field vocabulary -- keep in sync with the
// CHECK constraint on that column. When set, the portal-facing organizer form
// prefills this field from the client's record (via get_portal_client_snapshot)
// and, if the client edits it, proposes the change back to the client record
// (via propose_client_contact_field/propose_client_mailing_address) subject to
// staff approval when it would overwrite an existing value.
export type ClientProfileField = "first_name" | "last_name" | "business_name" | "primary_email" | "primary_phone" | "mailing_address";

export const CLIENT_PROFILE_FIELD_LABELS: Record<ClientProfileField, string> = {
  first_name: "First name",
  last_name: "Last name",
  business_name: "Business name",
  primary_email: "Email",
  primary_phone: "Phone",
  mailing_address: "Mailing address",
};

// Which client_profile_field options make sense for a given organizer field_type.
// short_text covers every scalar contact field; address covers the whole
// mailing address at once (the organizer's address field already stores
// street/city/state/zip together as one JSON value).
export const CLIENT_PROFILE_FIELDS_BY_TYPE: Partial<Record<OrganizerFieldType, ClientProfileField[]>> = {
  short_text: ["first_name", "last_name", "business_name", "primary_email", "primary_phone"],
  address: ["mailing_address"],
};

export function isValidClientProfileField(value: string): value is ClientProfileField {
  return value in CLIENT_PROFILE_FIELD_LABELS;
}
