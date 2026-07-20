"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabasePortal } from "@/lib/supabasePortal";
import type { PortalAccessListItem } from "@/lib/types";

type PortalContextValue = {
  access: PortalAccessListItem | null;
  accessList: PortalAccessListItem[];
  selectAccess: (a: PortalAccessListItem) => void;
  refresh: () => Promise<void>;
  loading: boolean;
};

const PortalContext = createContext<PortalContextValue | null>(null);

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal must be used within PortalProvider");
  return ctx;
}

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [accessList, setAccessList] = useState<PortalAccessListItem[]>([]);
  const [access, setAccess] = useState<PortalAccessListItem | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const { data, error } = await supabasePortal.rpc("get_my_portal_access_list");
    if (!error && data) {
      const list = data as PortalAccessListItem[];
      setAccessList(list);
      if (list.length === 1) {
        setAccess(list[0]);
      } else if (list.length > 1) {
        const savedId = sessionStorage.getItem("verexahq-portal-selected-access");
        const match = list.find((a) => a.portal_access_id === savedId);
        if (match) setAccess(match);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  function selectAccess(a: PortalAccessListItem) {
    setAccess(a);
    sessionStorage.setItem("verexahq-portal-selected-access", a.portal_access_id);
  }

  return (
    <PortalContext.Provider value={{ access, accessList, selectAccess, refresh, loading }}>
      {children}
    </PortalContext.Provider>
  );
}
