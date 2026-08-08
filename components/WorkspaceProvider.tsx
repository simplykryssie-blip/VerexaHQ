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
import { friendlyError } from "@/lib/friendlyError";
import { useToast } from "@/components/Toast";

export type WorkspaceInfo = {
  id: string;
  name: string;
  role: string;
  isOwner: boolean;
  // Mirrors is_workspace_admin(): is_owner OR role slug in (owner, admin).
  // Use this instead of comparing `role` to a literal string, so UI gates
  // stay in sync with what the RLS/RPC layer actually allows.
  isAdmin: boolean;
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
  const { showError } = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // list_my_active_workspaces does not exist in the live database.
      // get_my_workspaces() is the real RPC: it joins workspace_users ->
      // workspaces -> roles, scoped to auth.uid(), and returns every
      // membership regardless of status — filter to "active" here.
      const { data, error } = await supabase.rpc("get_my_workspaces");
      if (error) {
        // eslint-disable-next-line no-console -- keep a trace of the raw
        // error even though the toast below only shows a friendly message.
        console.error("Failed to load workspaces:", error);
        showError(friendlyError(error, "Couldn't load your workspaces. Please refresh the page."));
        setWorkspaces([]);
        return;
      }
      const rows = ((data ?? []) as Record<string, unknown>[])
        .filter((row) => row.status === "active")
        .map((row) => {
          const role = String(row.role_slug ?? "staff");
          const isOwner = Boolean(row.is_owner);
          return {
            id: String(row.workspace_id),
            name: String(row.workspace_name ?? "My firm"),
            role,
            isOwner,
            isAdmin: isOwner || role === "owner" || role === "admin",
            // No live role slug maps cleanly to the old "read only" concept
            // (staff/member/viewer/read_only/client_portal) — defaulting to
            // false for every role rather than guessing. Revisit once
            // there's a product decision on which of the 10 roles, if any,
            // should be read-only in this UI.
            readOnly: false,
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
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Unexpected error loading workspaces:", err);
      showError("Couldn't load your workspaces. Please refresh the page.");
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, [showError]);

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
