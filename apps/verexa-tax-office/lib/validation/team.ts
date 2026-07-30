import type { Enums } from "@/types/database";

type MembershipRole = Enums<"membership_role">;
type MembershipStatus = Enums<"membership_status">;

export const MEMBERSHIP_ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Owner",
  admin: "Admin",
  ero: "ERO",
  preparer: "Preparer",
  reviewer: "Reviewer",
  intake_specialist: "Intake specialist",
  document_specialist: "Document specialist",
  billing: "Billing",
  seasonal_staff: "Seasonal staff",
  auditor: "Auditor",
  client: "Client",
};

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  invited: "Invited",
  active: "Active",
  suspended: "Suspended",
  removed: "Removed",
};

export const STAFF_ROLES = (Object.keys(MEMBERSHIP_ROLE_LABELS) as MembershipRole[]).filter((r) => r !== "client");

export function membershipRoleLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (MEMBERSHIP_ROLE_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function membershipStatusLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (MEMBERSHIP_STATUS_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
