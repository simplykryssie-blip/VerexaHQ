"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PORTAL_NAV_ITEMS } from "@/lib/navigation/portal-config";

export function PortalNavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {PORTAL_NAV_ITEMS.map((item) => {
        const active = item.href === "/portal" ? pathname === "/portal" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-sidebar-accent text-white" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
