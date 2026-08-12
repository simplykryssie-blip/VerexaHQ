"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X, ShieldEllipsis, LogOut } from "lucide-react";
import { NAV_ITEMS, NAV_SECTIONS } from "@/lib/nav";
import { darkenHex, hexToRgba } from "@/lib/color";
import styles from "./SidebarRail.module.css";

/**
 * A TaxNitro/GoHighLevel-style icon rail: one icon per section, click to open a flyout
 * listing that section's pages. Same routes and data as the text sidebar -- this only
 * changes how you get to them.
 */
export function SidebarRail({
  workspaceName,
  logoUrl,
  primaryColor,
  secondaryColor,
  textColor,
  isPlatformAdmin,
}: {
  workspaceName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  textColor?: string | null;
  isPlatformAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const railStyle: React.CSSProperties = {};
  if (primaryColor) {
    (railStyle as Record<string, string>)["--rail-bg"] = primaryColor;
    (railStyle as Record<string, string>)["--rail-bg-2"] = darkenHex(primaryColor, 0.25);
  }
  if (secondaryColor) {
    (railStyle as Record<string, string>)["--blue-bright"] = secondaryColor;
  }
  if (textColor) {
    (railStyle as Record<string, string>)["--rail-ink"] = textColor;
    (railStyle as Record<string, string>)["--rail-muted"] = hexToRgba(textColor, 0.7) ?? textColor;
  }

  const allHrefs = NAV_ITEMS.flatMap((item) => ("children" in item ? item.children.map((c) => c.href) : [item.href]));
  const activeNavHref = allHrefs
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];

  useEffect(() => {
    setMobileOpen(false);
    setOpenSection(null);
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpenSection(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleSection(label: string) {
    setOpenSection((prev) => (prev === label ? null : label));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation menu"
        className={`${styles.mobileToggle} fixed left-3 top-3 z-30 rounded-lg p-2 shadow-sm lg:hidden`}
      >
        <Menu size={18} />
      </button>

      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />}

      <aside
        ref={containerRef}
        className={`${styles.rail} fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-[72px] shrink-0 flex-col items-center transition-transform duration-200 lg:static lg:h-screen lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={railStyle}
      >
        <div className={`${styles.header} flex w-full flex-col items-center gap-1 px-2 py-4`}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={workspaceName} className="h-8 w-8 rounded-lg object-contain" title={workspaceName} />
          ) : (
            <Image src="/brand/vmark.png" alt={workspaceName} width={26} height={21} priority title={workspaceName} />
          )}
          <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation menu" className="absolute right-2 top-2 lg:hidden">
            <X size={16} className={styles.railIcon} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-3">
          {NAV_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isOpen = openSection === section.label;
            const hasActiveItem = section.items.some((item) =>
              "children" in item ? item.children.some((c) => c.href === activeNavHref) : item.href === activeNavHref
            );
            return (
              <div key={section.label} className="relative">
                <button
                  type="button"
                  onClick={() => toggleSection(section.label)}
                  aria-expanded={isOpen}
                  aria-label={section.label}
                  title={section.label}
                  className={`${isOpen ? styles.railIconOpen : hasActiveItem ? styles.railIconActive : styles.railIcon} flex h-11 w-11 items-center justify-center rounded-lg`}
                >
                  <Icon size={20} strokeWidth={2} />
                </button>

                {isOpen && (
                  <div className={`${styles.flyout} absolute left-[calc(100%+8px)] top-0 z-50 w-56 rounded-xl py-2`}>
                    <p className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{section.label}</p>
                    {section.items.map((item) => {
                      const ItemIcon = item.icon;
                      if ("children" in item) {
                        return (
                          <div key={item.label}>
                            <p className="mt-1 flex items-center gap-2.5 px-4 py-1 text-xs font-medium text-slate">
                              <ItemIcon size={15} strokeWidth={2} className="shrink-0" /> {item.label}
                            </p>
                            {item.children.map((child) => {
                              const active = child.href === activeNavHref;
                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  className={`${active ? styles.flyoutItemActive : styles.flyoutItem} ml-4 block rounded-lg px-3 py-1.5 text-sm`}
                                >
                                  {child.label}
                                </Link>
                              );
                            })}
                          </div>
                        );
                      }
                      const active = item.href === activeNavHref;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`${active ? styles.flyoutItemActive : styles.flyoutItem} flex items-center gap-2.5 px-4 py-1.5 text-sm`}
                        >
                          <ItemIcon size={15} strokeWidth={2} className="shrink-0" /> {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {isPlatformAdmin && (
          <Link
            href="/platform-admin"
            aria-label="Platform Admin"
            title="Platform Admin"
            className={`${
              pathname === "/platform-admin" || pathname.startsWith("/platform-admin/") ? styles.railIconActive : styles.railIcon
            } mb-1 flex h-11 w-11 items-center justify-center rounded-lg`}
          >
            <ShieldEllipsis size={20} strokeWidth={2} />
          </Link>
        )}

        <div className={`${styles.footer} w-full px-2 py-3`} style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <form action="/api/auth/sign-out" method="post" className="flex justify-center">
            <button type="submit" aria-label="Sign out" title="Sign out" className={`${styles.signOut} flex h-11 w-11 items-center justify-center rounded-lg`}>
              <LogOut size={18} strokeWidth={2} />
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
