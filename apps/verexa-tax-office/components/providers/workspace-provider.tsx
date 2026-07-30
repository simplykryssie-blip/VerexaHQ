"use client";

import { createContext, useContext } from "react";
import type { MembershipRole } from "@/lib/permissions/roles";
import type { Tables } from "@/types/database";

export type WorkspaceContextValue = {
  workspace: Tables<"workspaces">;
  role: MembershipRole;
  memberships: { workspaceId: string; workspaceName: string; role: MembershipRole }[];
  user: { id: string; email: string | null; fullName: string | null };
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  value,
  children,
}: {
  value: WorkspaceContextValue;
  children: React.ReactNode;
}) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}
