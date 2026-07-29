"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Admin-only. Never import this from a workspace-facing /early-access page --
// admin_early_access_directory() is platform-admin-gated server-side, but
// the directory itself (every participant firm + member) must not be
// exposed to ordinary workspace members either.
export type DirectoryRow = {
  workspace_id: string;
  workspace_name: string | null;
  workspace_email: string | null;
  workspace_status: string | null;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  member_role: string | null;
  member_status: string | null;
};

export type DirectoryWorkspace = {
  id: string;
  name: string;
  email: string | null;
  status: string | null;
};

export type DirectoryUser = {
  id: string;
  name: string;
  email: string | null;
};

export function useEarlyAccessDirectory() {
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc("admin_early_access_directory");
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }
      setRows((data as DirectoryRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const workspaceMap = new Map<string, DirectoryWorkspace>();
  const userMap = new Map<string, DirectoryUser>();
  for (const r of rows) {
    if (!workspaceMap.has(r.workspace_id)) {
      workspaceMap.set(r.workspace_id, {
        id: r.workspace_id,
        name: r.workspace_name || "Unnamed workspace",
        email: r.workspace_email,
        status: r.workspace_status,
      });
    }
    if (!userMap.has(r.user_id)) {
      userMap.set(r.user_id, {
        id: r.user_id,
        name: r.user_name || r.user_email || "Unknown user",
        email: r.user_email,
      });
    }
  }

  function workspaceName(id: string | null | undefined): string {
    if (!id) return "—";
    return workspaceMap.get(id)?.name ?? id.slice(0, 8);
  }
  function userName(id: string | null | undefined): string {
    if (!id) return "—";
    return userMap.get(id)?.name ?? id.slice(0, 8);
  }

  return {
    loading,
    error,
    rows,
    workspaces: Array.from(workspaceMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    users: Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    workspaceMap,
    userMap,
    workspaceName,
    userName,
  };
}
