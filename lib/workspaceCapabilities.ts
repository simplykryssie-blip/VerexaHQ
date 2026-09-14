type WorkspaceTypeLike = { workspace_type: string };

export function isIndependentTier(workspace: WorkspaceTypeLike): boolean {
  return workspace.workspace_type === "independent_ptin";
}

export function canInviteStaff(workspace: WorkspaceTypeLike): boolean {
  return !isIndependentTier(workspace);
}

const ERO_MANAGEMENT_WORKSPACE_TYPES = new Set(["ero_office", "service_bureau", "multi_office_firm"]);

// The workspace types that run a team rather than a solo practice -- same
// set the EFIN field and staff-assignment defaults are already gated on,
// now the single source of truth instead of being redefined locally in
// firm-profile/page.tsx and roles/page.tsx.
export function isEroManagementTier(workspace: WorkspaceTypeLike): boolean {
  return ERO_MANAGEMENT_WORKSPACE_TYPES.has(workspace.workspace_type);
}

// Only a Service Bureau resells software/banking packages to the firms
// connected under it -- an ERO or multi-office firm still manages connected
// PTINs (isEroManagementTier), but never sells a package, so package
// building/assignment is gated on this narrower tier instead.
export function isServiceBureauTier(workspace: WorkspaceTypeLike): boolean {
  return workspace.workspace_type === "service_bureau";
}

// Narrower than isEroManagementTier on purpose: the ERO Network Command
// Center (Phase 5D) is scoped to a plain ERO office only, deliberately
// excluding Service Bureau (already served by its own Phase 5C command
// center) and multi_office_firm (an unresolved product classification --
// see Phase 5D audit). Mirrors isServiceBureauTier's exact shape.
export function isEroOfficeTier(workspace: WorkspaceTypeLike): boolean {
  return workspace.workspace_type === "ero_office";
}

// Phase 5E: Reports > Network is for a workspace that actually has a
// downstream network to report on -- an ERO office or a Service Bureau.
// multi_office_firm is deliberately excluded (same unresolved
// classification noted on isEroOfficeTier); an Independent PTIN has no
// downline network at all (CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE has
// no entry for it). Single source of truth shared by the Reports index
// tile visibility and the /reports/network route's own server-side gate,
// so the two can never drift apart.
export function isNetworkReportTier(workspace: WorkspaceTypeLike): boolean {
  return isEroOfficeTier(workspace) || isServiceBureauTier(workspace);
}
