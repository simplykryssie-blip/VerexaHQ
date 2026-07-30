"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { NavList } from "@/components/app-shell/nav-list";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "verexa-tax-office-sidebar-collapsed";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSE_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0 transition-all duration-200",
        collapsed ? "w-[68px]" : "w-64",
      )}
    >
      <div className={cn("flex items-center h-14 px-4 border-b border-sidebar-border", collapsed && "justify-center px-0")}>
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
          <LogoMark size={26} />
          {!collapsed && <span className="font-semibold text-sm truncate">Verexa Tax Office</span>}
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <NavList collapsed={collapsed} />
      </div>
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-2 px-4 h-11 border-t border-sidebar-border text-sidebar-foreground/70 hover:text-white text-xs font-medium"
      >
        {collapsed ? <ChevronsRight className="h-4 w-4 mx-auto" /> : (
          <>
            <ChevronsLeft className="h-4 w-4" /> Collapse
          </>
        )}
      </button>
    </aside>
  );
}
