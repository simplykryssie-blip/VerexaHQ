import type { Database } from "@/types/database";

// membership_role, verbatim from the generated database types
// (public.membership_role enum) — never invent a role value here.
export type MembershipRole = Database["public"]["Enums"]["membership_role"];

export const MEMBERSHIP_ROLES: MembershipRole[] = [
  "owner",
  "admin",
  "ero",
  "preparer",
  "reviewer",
  "intake_specialist",
  "document_specialist",
  "billing",
  "seasonal_staff",
  "auditor",
  "client",
];

export const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Owner",
  admin: "Admin",
  ero: "ERO",
  preparer: "Preparer",
  reviewer: "Reviewer",
  intake_specialist: "Intake Specialist",
  document_specialist: "Document Specialist",
  billing: "Billing",
  seasonal_staff: "Seasonal Staff",
  auditor: "Auditor / Read-only",
  client: "Client Portal User",
};

// Staff roles that belong in the internal CRM shell. "client" is a portal
// identity and never gets internal-app navigation.
export const STAFF_ROLES: MembershipRole[] = MEMBERSHIP_ROLES.filter((r) => r !== "client");
