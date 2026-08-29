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
