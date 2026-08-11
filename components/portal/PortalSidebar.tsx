"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { PORTAL_NAV_ITEMS } from "@/lib/portalNav";

export function PortalSidebar({ clientLabel, pendingCount }: { clientLabel: string; pendingCount: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="fixed left-3 top-3 z-30 rounded-lg border border-border bg-surface p-2 text-slate shadow-sm lg:hidden"
      >
        <Menu size={18} />
      </button>

      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-64 shrink-0 flex-col border-r border-border bg-surface transition-transform duration-200 lg:static lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-5">
          <div>
            <p className="text-sm font-semibold text-ink">VerexaHQ</p>
            <p className="mt-0.5 truncate text-xs text-muted">{clientLabel}</p>
            <span className="mt-2 inline-flex items-center rounded-full bg-accentSoft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
              Client Portal
            </span>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation menu" className="text-muted hover:text-ink lg:hidden">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {PORTAL_NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-accentSoft text-accent" : "text-slate hover:bg-surfaceMuted hover:text-ink"
                }`}
              >
                <Icon size={18} strokeWidth={2} />
                {item.label}
                {item.href === "/portal/notifications" && pendingCount > 0 && (
                  <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-white">{pendingCount}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border px-3 py-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
          <form action="/api/auth/sign-out" method="post">
            <input type="hidden" name="audience" value="portal" />
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-muted hover:bg-surfaceMuted hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
