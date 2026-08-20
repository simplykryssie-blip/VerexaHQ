"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown, ShieldEllipsis } from "lucide-react";
import { NAV_ITEMS, NAV_SECTIONS } from "@/lib/nav";
import { hexToRgba } from "@/lib/color";
import { useTrimmedLogo } from "@/lib/useTrimmedLogo";
import styles from "./Sidebar.module.css";

export function Sidebar({
  workspaceName,
  logoUrl,
  primaryColor,
  secondaryColor,
  isPlatformAdmin,
}: {
  workspaceName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  isPlatformAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const trimmedLogoUrl = useTrimmedLogo(logoUrl);

  // primaryColor is unused here now that the sidebar is a light surface --
  // it's kept in the props/Brand Center settings for a future use (e.g. a
  // portal accent) rather than driving a colored rail background.
  //
  // There's no per-workspace text-color override anymore either: that only
  // ever made sense back when the rail's own background was a custom color
  // and could get dark enough to need light text. Now that the sidebar is
  // always this same light surface, applying a stored override can only
  // ever make text harder to read against it (a leftover light value renders
  // as near-invisible on the light background) with no upside, so the app
  // no longer reads or applies branding.sidebar_text_color at all.
  const sidebarStyle: React.CSSProperties = {};
  if (secondaryColor) {
    (sidebarStyle as Record<string, string>)["--blue-bright"] = secondaryColor;
    (sidebarStyle as Record<string, string>)["--blue-bright-soft"] = hexToRgba(secondaryColor, 0.1) ?? secondaryColor;
  }

  // Flatten every navigable href (top-level items + group children) so the
  // longest-prefix-match logic works regardless of nesting, and a group's
  // children can be matched the same way leaf items always were.
  const allHrefs = NAV_ITEMS.flatMap((item) => ("children" in item ? item.children.map((c) => c.href) : [item.href]));
  const activeNavHref = allHrefs
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(NAV_ITEMS.filter((item) => "children" in item && item.children.some((c) => c.href === activeNavHref)).map((item) => item.label))
  );

  function toggleExpanded(label: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

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
        className={`${styles.sidebar} fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-64 shrink-0 flex-col font-sans shadow-soft transition-transform duration-200 lg:static lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={sidebarStyle}
      >
        <div className={`${styles.header} flex items-center justify-between px-5 py-5`}>
          <div>
            {trimmedLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={trimmedLogoUrl} alt={workspaceName} style={{ display: "block", maxHeight: "44px", maxWidth: "200px", objectFit: "contain" }} />
            ) : (
              <>
                <Image src="/brand/vmark.png" alt="" width={22} height={18} priority style={{ marginBottom: 6 }} />
                <Image
                  src="/brand/wordmark.png"
                  alt="VerexaHQ"
                  width={112}
                  height={19}
                  priority
                  style={{ display: "block", height: "19px", width: "auto" }}
                />
              </>
            )}
            <p className={`${styles.workspaceName} mt-1.5 truncate text-xs`}>{workspaceName}</p>
            <span className={`${styles.badge} mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide`}>
              Tax Office module
            </span>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation menu" className={`${styles.workspaceName} lg:hidden`}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p className={`${styles.sectionLabel} px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider`}>{section.label}</p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;

                  if ("children" in item) {
                    const isOpen = expanded.has(item.label);
                    const hasActiveChild = item.children.some((c) => c.href === activeNavHref);
                    return (
                      <div key={item.label}>
                        <button
                          type="button"
                          onClick={() => toggleExpanded(item.label)}
                          aria-expanded={isOpen}
                          className={`${hasActiveChild ? styles.navItemActive : styles.navItem} flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium`}
                        >
                          <Icon size={18} strokeWidth={2} className="shrink-0" />
                          <span className="flex-1 text-left">{item.label}</span>
                          <ChevronDown size={14} className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </button>
                        {isOpen && (
                          <div className={`${styles.subNav} ml-4 mt-1 space-y-1 border-l pl-3`}>
                            {item.children.map((child) => {
                              const active = child.href === activeNavHref;
                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  className={`${active ? styles.navItemActive : styles.navItem} block rounded-lg px-3 py-2 text-sm font-medium`}
                                >
                                  {child.label}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  const active = item.href === activeNavHref;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`${active ? styles.navItemActive : styles.navItem} flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium`}
                    >
                      <Icon size={18} strokeWidth={2} className="shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {isPlatformAdmin && (
          <div className="px-3 pb-1">
            <Link
              href="/platform-admin"
              className={`${
                pathname === "/platform-admin" || pathname.startsWith("/platform-admin/") ? styles.navItemActive : styles.navItem
              } flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium`}
            >
              <ShieldEllipsis size={18} strokeWidth={2} className="shrink-0" />
              Platform Admin
            </Link>
          </div>
        )}

        <div className={`${styles.footer} px-3 py-4`} style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
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
