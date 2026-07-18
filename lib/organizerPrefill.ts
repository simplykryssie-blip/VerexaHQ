import type { Client, TaxOrganizerQuestion } from "@/lib/types";

const NON_FINANCIAL_FIELDS = new Set([
  "first_name",
  "last_name",
  "business_name",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "zip_code",
  "date_of_birth",
  "ssn_last_four",
  "client_type",
]);

export function organizerPrefillValue(question: TaxOrganizerQuestion, client: Client) {
  if (!question.mapped_field || !NON_FINANCIAL_FIELDS.has(question.mapped_field)) return undefined;
  const value = client[question.mapped_field as keyof Client];
  return value === null || value === undefined || value === "" ? undefined : value;
}

export function clientDisplayName(client: Client) {
  return client.client_type === "business" && client.business_name
    ? client.business_name
    : `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim();
}
