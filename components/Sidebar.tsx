"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { archivo, publicSans, plexMono } from "@/lib/authFonts";
import styles from "./Sidebar.module.css";

export function Sidebar({ workspaceName }: { workspaceName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Some hrefs are prefixes of others (e.g. "/settings" and
  // "/settings/templates"), so pick the longest matching href rather than
  // highlighting every ancestor at once.
  const activeNavHref = NAV_ITEMS.filter(
    (candidate) => pathname === candidate.href || pathname.startsWith(candidate.href + "/")
  ).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className={`${styles.mobileToggle} fixed left-3 top-3 z-30 rounded-lg p-2 shadow-sm lg:hidden`}
      >
        <Menu size={18} />
      </button>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`${styles.sidebar} ${archivo.variable} ${publicSans.variable} ${plexMono.variable} fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ fontFamily: "var(--font-public-sans), system-ui, sans-serif" }}
      >
        <div className={`${styles.header} flex items-center justify-between px-5 py-5`}>
          <div>
            <Image src="/brand/vmark.png" alt="" width={22} height={18} priority style={{ marginBottom: 6 }} />
            <Image
              src="/brand/wordmark.png"
              alt="VerexaHQ"
              width={112}
              height={19}
              priority
              style={{ display: "block", height: "19px", width: "auto" }}
            />
            <p className={`${styles.workspaceName} mt-1.5 truncate text-xs`}>{workspaceName}</p>
            <span className={`${styles.badge} mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide`}>
              Tax Office module
            </span>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation menu" className={`${styles.workspaceName} lg:hidden`}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const active = item.href === activeNavHref;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${active ? styles.navItemActive : styles.navItem} flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium`}
              >
                <Icon size={18} strokeWidth={2} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className={`${styles.footer} px-3 py-4`}>
          <form action="/api/auth/sign-out" method="post">
            <button type="submit" className={`${styles.signOut} w-full rounded-lg px-3 py-2 text-left text-sm font-medium`}>
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
