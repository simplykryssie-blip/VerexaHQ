"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_NAV_SECTIONS } from "@/lib/nav";

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 overflow-x-auto px-1 py-2 lg:sticky lg:top-0 lg:block lg:w-56 lg:shrink-0 lg:space-y-4 lg:self-start lg:px-1 lg:py-6">
      {SETTINGS_NAV_SECTIONS.map((section) => (
        <div key={section.label} className="flex gap-1 lg:block lg:space-y-1">
          <p className="hidden px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted lg:block">{section.label}</p>
          {section.items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-accentSoft text-accent" : "text-slate hover:bg-surfaceMuted hover:text-ink"
                }`}
              >
                <Icon size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
