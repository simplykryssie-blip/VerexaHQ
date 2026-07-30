import type { MembershipRole } from "./roles";

// Frontend permission helpers. These control what the UI *offers* (which
// nav items, buttons, and pages render) so users aren't shown actions they
// can't take — but Postgres RLS is the real enforcement layer underneath
// every one of these. A hidden button here is a UX courtesy, not a
// security boundary; every mutation still runs as the authenticated user
// through RLS-scoped policies.
export type Capability =
  | "manage_workspace"
  | "manage_team"
  | "manage_integrations"
  | "manage_billing"
  | "view_all_clients"
  | "view_assigned_clients_only"
  | "prepare_returns"
  | "review_returns"
  | "release_returns"
  | "manage_templates"
  | "manage_workflows"
  | "view_reports"
  | "manage_compliance"
  | "access_portal_only";

const CAPABILITIES_BY_ROLE: Record<MembershipRole, Capability[]> = {
  owner: [
    "manage_workspace",
    "manage_team",
    "manage_integrations",
    "manage_billing",
    "view_all_clients",
    "prepare_returns",
    "review_returns",
    "release_returns",
    "manage_templates",
    "manage_workflows",
    "view_reports",
    "manage_compliance",
  ],
  admin: [
    "manage_workspace",
    "manage_team",
    "manage_integrations",
    "manage_billing",
    "view_all_clients",
    "prepare_returns",
    "review_returns",
    "release_returns",
    "manage_templates",
    "manage_workflows",
    "view_reports",
    "manage_compliance",
  ],
  ero: ["view_all_clients", "review_returns", "release_returns", "view_reports", "manage_compliance"],
  preparer: ["view_assigned_clients_only", "prepare_returns", "view_reports"],
  reviewer: ["view_all_clients", "review_returns", "view_reports", "manage_compliance"],
  intake_specialist: ["view_assigned_clients_only", "view_reports"],
  document_specialist: ["view_assigned_clients_only", "view_reports"],
  billing: ["view_all_clients", "manage_billing", "view_reports"],
  seasonal_staff: ["view_assigned_clients_only"],
  auditor: ["view_all_clients", "view_reports"],
  client: ["access_portal_only"],
};

export function roleHasCapability(role: MembershipRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return CAPABILITIES_BY_ROLE[role]?.includes(capability) ?? false;
}

export function canViewAllClients(role: MembershipRole | null | undefined) {
  return roleHasCapability(role, "view_all_clients");
}

export function isPortalOnly(role: MembershipRole | null | undefined) {
  return role === "client";
}
