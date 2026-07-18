"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";

export type WorkspaceInfo = {
  id: string;
  name: string;
  role: string;
  readOnly: boolean;
};
type WorkspaceContextValue = {
  workspaces: WorkspaceInfo[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceInfo | null;
  loading: boolean;
  switchWorkspace: (id: string) => void;
  refresh: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_my_active_workspaces");
    if (!error) {
      const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => {
        const role = String(row.role ?? "Staff");
        return {
          id: String(row.workspace_id),
          name: String(row.business_name ?? "My firm"),
          role,
          readOnly: [
            "staff",
            "member",
            "viewer",
            "read_only",
            "client_portal",
          ].includes(role.toLowerCase()),
        };
      });
      setWorkspaces(rows);
      const saved =
        typeof window !== "undefined"
          ? localStorage.getItem("verexahq_active_workspace")
          : null;
      setActiveWorkspaceId((current) =>
        rows.some((row) => row.id === current)
          ? current
          : (rows.find((row) => row.id === saved)?.id ?? rows[0]?.id ?? null),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  const switchWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId(id);
    localStorage.setItem("verexahq_active_workspace", id);
  }, []);
  const activeWorkspace = useMemo(
    () => workspaces.find((row) => row.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  );
  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspaceId,
        activeWorkspace,
        loading,
        switchWorkspace,
        refresh,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value)
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}
