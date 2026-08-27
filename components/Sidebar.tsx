"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown, Layers, Check, Home } from "lucide-react";
import { NAV_ITEMS, NAV_SECTIONS, PLATFORM_HOME_NAV_ITEMS, PLATFORM_HOME_NAV_SECTIONS } from "@/lib/nav";
import { hexToRgba, getReadableTextColor } from "@/lib/color";
import { useTrimmedLogo } from "@/lib/useTrimmedLogo";
import { Avatar } from "@/components/Avatar";
import styles from "./Sidebar.module.css";

const WORKSPACE_TYPE_SHORT_LABELS: Record<string, string> = {
  independent_ptin: "PTIN",
  ero_office: "ERO",
  service_bureau: "SB",
};

// The rail's own default look, used whenever a workspace hasn't set a custom
// sidebarBgColor -- flows through the exact same getReadableTextColor/hexToRgba
// derivation a custom color would, rather than relying on separate CSS-module
// fallbacks, so there is only ever one place this math happens.
const DEFAULT_RAIL_BG = "#0F172A";

export function Sidebar({
  workspaceName,
  logoUrl,
  primaryColor,
  secondaryColor,
  sidebarBgColor,
  isPlatformHomeWorkspace,
  switchableWorkspaces,
  showMessages,
  currentUser,
}: {
  workspaceName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  /** Custom sidebar background from Brand Center. Falls back to DEFAULT_RAIL_BG (dark) when unset; when set, text/hover/border colors are derived from it automatically (see getReadableTextColor) rather than needing their own stored override. */
  sidebarBgColor?: string | null;
  /** True only while the active workspace is Verexa's own is_platform_home
   *  workspace -- swaps the whole nav for the platform-admin tooling instead
   *  of the client-facing CRM nav every other (real or demo) workspace gets. */
  isPlatformHomeWorkspace?: boolean;
  /** Home workspace + the demo PTIN/ERO/SB shells a platform admin can switch into to demo the product. Empty for everyone else. */
  switchableWorkspaces?: { id: string; name: string; workspaceType: string; isHome: boolean; isActive: boolean }[];
  /** Internal network messaging is only relevant to an ERO/SB and PTINs connected to one -- a standalone workspace has no one to message. */
  showMessages?: boolean;
  /** The signed-in staff member, shown in the footer above sign-out. Optional so a caller mid-migration (or a page that hasn't threaded it through yet) still renders a valid sidebar. */
  currentUser?: { name: string | null; avatarUrl: string | null; roleLabel: string | null } | null;
}) {
  const pathname = usePathname();
  const [switching, setSwitching] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  async function switchWorkspace(workspaceId: string) {
    if (switching) return;
    setSwitching(true);
    const res = await fetch("/api/workspace/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    if (res.ok) {
      window.location.href = "/dashboard";
      return;
    }
    setSwitching(false);
  }
  const [open, setOpen] = useState(false);
  const trimmedLogoUrl = useTrimmedLogo(logoUrl);

  // primaryColor is unused here -- it's the "Fallback accent color" shown on
  // public forms, not the rail. The rail's own background is sidebarBgColor
  // instead, a dedicated field Brand Center exposes.
  const navItems = isPlatformHomeWorkspace ? PLATFORM_HOME_NAV_ITEMS : NAV_ITEMS;
  const navSections = isPlatformHomeWorkspace ? PLATFORM_HOME_NAV_SECTIONS : NAV_SECTIONS;

  // Verexa HQ CRM is home base, not one more option in a list of demos --
  // it gets its own pinned "back to" link (shown only while elsewhere), and
  // the collapsible list below is exclusively the demo PTIN/ERO/SB shells.
  const homeWorkspaceEntry = switchableWorkspaces?.find((w) => w.isHome);
  const demoWorkspaces = switchableWorkspaces?.filter((w) => !w.isHome) ?? [];

  const sidebarStyle: React.CSSProperties = {};
  const railBg = sidebarBgColor ?? DEFAULT_RAIL_BG;
  const railTextColor = getReadableTextColor(railBg);
  const isDarkRail = railTextColor === "#ffffff";
  (sidebarStyle as Record<string, string>)["--rail-bg"] = railBg;
  (sidebarStyle as Record<string, string>)["--rail-ink"] = railTextColor;
  (sidebarStyle as Record<string, string>)["--rail-muted"] = hexToRgba(railTextColor, 0.72) ?? railTextColor;
  (sidebarStyle as Record<string, string>)["--rail-section"] = hexToRgba(railTextColor, 0.55) ?? railTextColor;
  (sidebarStyle as Record<string, string>)["--rail-border"] = hexToRgba(railTextColor, isDarkRail ? 0.18 : 0.12) ?? railTextColor;
  (sidebarStyle as Record<string, string>)["--rail-hover-bg"] = hexToRgba(railTextColor, isDarkRail ? 0.12 : 0.06) ?? railTextColor;

  if (secondaryColor) {
    (sidebarStyle as Record<string, string>)["--blue-bright"] = secondaryColor;
    // A flat 10% tint reads confidently on a light rail but washes out on a
    // dark one -- bump it the same way --rail-border/--rail-hover-bg already
    // scale for isDarkRail, so the active-item pill keeps the same visual
    // weight regardless of rail color.
    (sidebarStyle as Record<string, string>)["--blue-bright-soft"] = hexToRgba(secondaryColor, isDarkRail ? 0.18 : 0.1) ?? secondaryColor;
  }

  // Flatten every navigable href (top-level items + group children) so the
  // longest-prefix-match logic works regardless of nesting, and a group's
  // children can be matched the same way leaf items always were.
  const allHrefs = navItems.flatMap((item) => ("children" in item ? item.children.map((c) => c.href) : [item.href]));
  const activeNavHref = allHrefs
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(navItems.filter((item) => "children" in item && item.children.some((c) => c.href === activeNavHref)).map((item) => item.label))
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
          {navSections.map((section) => (
            <div key={section.label}>
              <p className={`${styles.sectionLabel} px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider`}>{section.label}</p>
              <div className="space-y-1">
                {section.items
                  .filter((item) => item.label !== "Messages" || showMessages)
                  .map((item) => {
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

        {homeWorkspaceEntry && !homeWorkspaceEntry.isActive && (
          <div className="px-3 pb-1">
            <button
              type="button"
              onClick={() => switchWorkspace(homeWorkspaceEntry.id)}
              disabled={switching}
              className={`${styles.navItem} flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium disabled:cursor-default`}
            >
              <Home size={18} strokeWidth={2} className="shrink-0" />
              Back to {homeWorkspaceEntry.name}
            </button>
          </div>
        )}

        {demoWorkspaces.length > 0 && (
          <div className="px-3 pb-1">
            <button
              type="button"
              onClick={() => setDemoOpen((v) => !v)}
              aria-expanded={demoOpen}
              className={`${styles.navItem} flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium`}
            >
              <Layers size={18} strokeWidth={2} className="shrink-0" />
              <span className="flex-1 text-left">Demo Accounts</span>
              <ChevronDown size={14} className={`shrink-0 transition-transform ${demoOpen ? "rotate-180" : ""}`} />
            </button>
            {demoOpen && (
              <div className={`${styles.subNav} ml-4 mt-1 space-y-1 border-l pl-3`}>
                {demoWorkspaces.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => switchWorkspace(w.id)}
                    disabled={switching || w.isActive}
                    className={`${
                      w.isActive ? styles.navItemActive : styles.navItem
                    } flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium disabled:cursor-default`}
                  >
                    <span className="truncate">{`Demo: ${WORKSPACE_TYPE_SHORT_LABELS[w.workspaceType] ?? w.workspaceType}`}</span>
                    {w.isActive && <Check size={14} className="shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={`${styles.footer} px-3 py-4`} style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
          {currentUser && (
            <div className="mb-2 flex items-center gap-2.5 px-3 pb-3">
              <Avatar name={currentUser.name} url={currentUser.avatarUrl} size="sm" />
              <div className="min-w-0">
                <p className={`${styles.workspaceName} truncate text-sm font-medium`} style={{ color: "var(--rail-ink)" }}>
                  {currentUser.name ?? "Staff"}
                </p>
                {currentUser.roleLabel && <p className={`${styles.workspaceName} truncate text-xs`}>{currentUser.roleLabel}</p>}
              </div>
            </div>
          )}
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
