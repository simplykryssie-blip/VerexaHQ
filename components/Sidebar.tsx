"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, X, ChevronDown, Layers, Check, Home } from "lucide-react";
import { NAV_ITEMS, NAV_SECTIONS, PLATFORM_HOME_NAV_ITEMS, PLATFORM_HOME_NAV_SECTIONS, ERO_MANAGEMENT_NAV_ITEMS, ERO_MANAGEMENT_NAV_SECTION } from "@/lib/nav";
import { hexToRgba, readableTextColor } from "@/lib/color";
import { useTrimmedLogo } from "@/lib/useTrimmedLogo";
import { Avatar } from "@/components/Avatar";
import styles from "./Sidebar.module.css";

const WORKSPACE_TYPE_SHORT_LABELS: Record<string, string> = {
  independent_ptin: "PTIN",
  ero_office: "ERO",
  service_bureau: "SB",
};

// The rail's own default look, used whenever a workspace hasn't set a custom
// bgColor -- flows through the exact same readableTextColor/hexToRgba
// derivation a custom color would, rather than relying on separate CSS-module
// fallbacks, so there is only ever one place this math happens.
const DEFAULT_RAIL_BG = "#0F172A";

export function Sidebar({
  workspaceName,
  logoUrl,
  primaryColor,
  secondaryColor,
  bgColor,
  textColor,
  isPlatformHomeWorkspace,
  switchableWorkspaces,
  showMessages,
  showPartners,
  showEroManagement,
  currentUser,
  reviewQueueHasItems,
}: {
  workspaceName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  /** Custom sidebar background from Branding. Falls back to DEFAULT_RAIL_BG (dark) when unset. */
  bgColor?: string | null;
  /** Resolved by getEffectiveBranding() -- either an explicit override or auto-picked for contrast against bgColor. */
  textColor?: string | null;
  /** True only while the active workspace is Verexa's own is_platform_home
   *  workspace -- swaps the whole nav for the platform-admin tooling instead
   *  of the client-facing CRM nav every other (real or demo) workspace gets. */
  isPlatformHomeWorkspace?: boolean;
  /** Home workspace + the demo PTIN/ERO/SB shells a platform admin can switch into to demo the product. Empty for everyone else. */
  switchableWorkspaces?: { id: string; name: string; workspaceType: string; isHome: boolean; isActive: boolean }[];
  /** Internal network messaging is only relevant to an ERO/SB and PTINs connected to one -- a standalone workspace has no one to message. */
  showMessages?: boolean;
  /** Partners is only relevant to an ERO/SB with connections to manage -- an independent PTIN has no one to show there. */
  showPartners?: boolean;
  /** True for an ERO/Service Bureau/multi-office workspace (isEroManagementTier) -- adds the "ERO Management" section (ERO Dashboard, Team -- which also holds Connections -- ERO Profile) to the main nav. Assignments lives in the regular Daily section instead, since every workspace tier needs to reassign work, not just ERO/SB. */
  showEroManagement?: boolean;
  /** The signed-in staff member, shown in the footer above sign-out. Optional so a caller mid-migration (or a page that hasn't threaded it through yet) still renders a valid sidebar. */
  currentUser?: { name: string | null; avatarUrl: string | null; roleLabel: string | null } | null;
  /** True when anything is sitting in Review Queue -- client info changes, submitted organizers, or (for an ERO/SB) shared engagements awaiting a decision -- shown as a small dot on the nav item so staff don't have to open the page to find out. */
  reviewQueueHasItems?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
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

  // primaryColor is unused here -- kept in the props/Brand Center settings
  // for the public-form fallback accent, not a sidebar concern.
  // Verexa HQ's own platform-admin nav has no tier concept -- ERO Management
  // only ever layers onto the regular client-facing nav.
  const showEro = showEroManagement && !isPlatformHomeWorkspace;
  const navItems = isPlatformHomeWorkspace
    ? PLATFORM_HOME_NAV_ITEMS
    : showEro
      ? [...NAV_ITEMS, ...ERO_MANAGEMENT_NAV_ITEMS]
      : NAV_ITEMS;
  const navSections = isPlatformHomeWorkspace
    ? PLATFORM_HOME_NAV_SECTIONS
    : showEro
      ? (() => {
          const adminIndex = NAV_SECTIONS.findIndex((s) => s.label === "Admin");
          return [...NAV_SECTIONS.slice(0, adminIndex), ERO_MANAGEMENT_NAV_SECTION, ...NAV_SECTIONS.slice(adminIndex)];
        })()
      : NAV_SECTIONS;

  // Verexa HQ CRM is home base, not one more option in a list of demos --
  // it gets its own pinned "back to" link (shown only while elsewhere), and
  // the collapsible list below is exclusively the demo PTIN/ERO/SB shells.
  const homeWorkspaceEntry = switchableWorkspaces?.find((w) => w.isHome);
  const demoWorkspaces = switchableWorkspaces?.filter((w) => !w.isHome) ?? [];

  const sidebarStyle: React.CSSProperties = {};
  // No custom bgColor -- rather than falling back to the CSS module's light
  // default, the rail defaults dark, going through this same derivation a
  // custom color would (see readableTextColor / hexToRgba below).
  const effectiveBg = bgColor ?? DEFAULT_RAIL_BG;
  const effectiveTextColor = textColor ?? readableTextColor(effectiveBg);
  const isDarkBg = effectiveTextColor === "#FFFFFF";
  if (secondaryColor) {
    (sidebarStyle as Record<string, string>)["--blue-bright"] = secondaryColor;
    // A flat 10% tint reads confidently on a light rail but washes out on a
    // dark one -- bump it the same way the rail-border/rail-hover tokens
    // already scale for isDarkBg, so the active-item pill keeps the same
    // visual weight regardless of rail color.
    const softTint = hexToRgba(secondaryColor, isDarkBg ? 0.18 : 0.1) ?? secondaryColor;
    (sidebarStyle as Record<string, string>)["--blue-bright-soft"] = softTint;
    // A workspace that's picked its own color gets exactly that color as a
    // flat active-item pill, same as always -- the CSS module's brand
    // gradient default (blue-to-lime) is only for a workspace that hasn't
    // customized anything, not blended with an arbitrary chosen color.
    (sidebarStyle as Record<string, string>)["--nav-active-bg"] = softTint;
    (sidebarStyle as Record<string, string>)["--nav-active-ink"] = secondaryColor;
  }
  (sidebarStyle as Record<string, string>)["--rail-bg"] = effectiveBg;
  (sidebarStyle as Record<string, string>)["--rail-ink"] = effectiveTextColor;
  (sidebarStyle as Record<string, string>)["--rail-muted"] = isDarkBg ? "rgba(255, 255, 255, 0.65)" : "#64748b";
  (sidebarStyle as Record<string, string>)["--rail-section"] = isDarkBg ? "rgba(255, 255, 255, 0.45)" : "#9aa1ae";
  (sidebarStyle as Record<string, string>)["--rail-border"] = isDarkBg ? "rgba(255, 255, 255, 0.14)" : "#e3e7f0";
  (sidebarStyle as Record<string, string>)["--rail-hover"] = isDarkBg ? "rgba(255, 255, 255, 0.08)" : "#f4f6fb";

  // Flatten every navigable href (top-level items + group children) so the
  // longest-prefix-match logic works regardless of nesting, and a group's
  // children can be matched the same way leaf items always were. A handful
  // of hrefs (e.g. Contacts' Leads/Individual/Business children) share one
  // pathname and differ only by query string, so a match there also has to
  // check that every query param the href asks for is present in the
  // current URL -- pathname alone can't tell those apart.
  const allHrefs = navItems.flatMap((item) => ("children" in item ? item.children.map((c) => c.href) : [item.href]));
  const activeNavHref = allHrefs
    .filter((href) => {
      const [hrefPath, hrefQuery] = href.split("?");
      if (pathname !== hrefPath && !pathname.startsWith(hrefPath + "/")) return false;
      if (!hrefQuery) return true;
      return Array.from(new URLSearchParams(hrefQuery).entries()).every(([key, value]) => searchParams.get(key) === value);
    })
    .sort((a, b) => {
      const aSpecific = a.includes("?") ? 1 : 0;
      const bSpecific = b.includes("?") ? 1 : 0;
      return aSpecific !== bSpecific ? bSpecific - aSpecific : b.length - a.length;
    })[0];

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
              <img src={trimmedLogoUrl} alt={workspaceName} style={{ display: "block", maxHeight: "60px", maxWidth: "220px", objectFit: "contain" }} />
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
                  .filter((item) => item.label !== "Partners" || showPartners)
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
                      <span className="relative shrink-0">
                        <Icon size={18} strokeWidth={2} />
                        {item.label === "Review Queue" && reviewQueueHasItems && (
                          <span aria-label="Items waiting on review" className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger" style={{ boxShadow: `0 0 0 2px ${effectiveBg}` }} />
                        )}
                      </span>
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
