"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_NAV_ITEMS } from "@/lib/nav";

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="w-56 shrink-0 space-y-1 border-r border-border bg-surface px-3 py-5">
      {SETTINGS_NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-accentSoft text-accent" : "text-slate hover:bg-surfaceMuted hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
