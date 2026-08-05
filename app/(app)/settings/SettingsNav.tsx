"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_NAV_ITEMS } from "@/lib/nav";

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-3 py-2 lg:block lg:w-56 lg:shrink-0 lg:space-y-1 lg:border-b-0 lg:border-r lg:px-3 lg:py-5">
      {SETTINGS_NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
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
