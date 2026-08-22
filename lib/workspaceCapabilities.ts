type WorkspaceTypeLike = { workspace_type: string };

export function isIndependentTier(workspace: WorkspaceTypeLike): boolean {
  return workspace.workspace_type === "independent_ptin";
}

export function canInviteStaff(workspace: WorkspaceTypeLike): boolean {
  return !isIndependentTier(workspace);
}
