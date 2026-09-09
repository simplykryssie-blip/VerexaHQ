"use client";

import Link from "next/link";

export type TabItem = { id: string; label: string; badge?: number; href?: string };

/** The shared underline tab bar for a workspace's content sections (client,
 * engagement, etc.). Not for compact filter switchers -- those stay on
 * whatever pill-group style already suits them.
 *
 * Renders each tab as a `<Link>` when it carries an `href` (for server-
 * component pages whose active tab is `?tab=`-driven, e.g. Assignments,
 * Email & SMS, Form Templates) or a `<button onClick>` otherwise (client-
 * state tabs). A tab list is one or the other, never mixed, so `onChange`
 * is optional and only needed in the button case. */
export function Tabs({ tabs, active, onChange }: { tabs: TabItem[]; active: string; onChange?: (id: string) => void }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const className = `flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${
          isActive ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
        }`;
        const content = (
          <>
            {tab.label}
            {typeof tab.badge === "number" && tab.badge > 0 && (
              <span className="rounded-full bg-accentSoft px-1.5 py-0.5 text-[10px] font-semibold text-accent">{tab.badge}</span>
            )}
          </>
        );
        return tab.href ? (
          <Link key={tab.id} href={tab.href} role="tab" aria-selected={isActive} className={className}>
            {content}
          </Link>
        ) : (
          <button key={tab.id} type="button" role="tab" aria-selected={isActive} onClick={() => onChange?.(tab.id)} className={className}>
            {content}
          </button>
        );
      })}
    </nav>
  );
}
