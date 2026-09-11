"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SectionRenderer } from "./SectionRenderer";
import type { SiteSection } from "./types";

type ActivePopup = {
  id: string;
  name: string;
  trigger_type: "on_load" | "after_delay" | "exit_intent" | "scroll_percent";
  trigger_value: number | null;
  display_frequency: "every_visit" | "once_per_session" | "once_ever" | "every_n_days";
  frequency_days: number | null;
  background_color: string | null;
  custom_css: string | null;
  sections: SiteSection[];
};

function storageKey(popupId: string) {
  return `verexa_popup_shown_${popupId}`;
}

// A popup with `every_visit` never suppresses; every other frequency records
// a last-shown timestamp (localStorage for once_ever/every_n_days so it
// survives across sessions, sessionStorage for once_per_session) and checks
// it before arming.
function alreadyShown(popup: ActivePopup): boolean {
  if (popup.display_frequency === "every_visit") return false;
  try {
    if (popup.display_frequency === "once_per_session") {
      return sessionStorage.getItem(storageKey(popup.id)) !== null;
    }
    const stored = localStorage.getItem(storageKey(popup.id));
    if (!stored) return false;
    if (popup.display_frequency === "once_ever") return true;
    // every_n_days
    const last = Number(stored);
    if (!last) return false;
    const daysSince = (Date.now() - last) / (1000 * 60 * 60 * 24);
    return daysSince < (popup.frequency_days ?? 0);
  } catch {
    // Storage unavailable (private browsing, blocked cookies) -- fail open
    // and just show the popup rather than silently never showing it.
    return false;
  }
}

function markShown(popup: ActivePopup) {
  try {
    if (popup.display_frequency === "once_per_session") {
      sessionStorage.setItem(storageKey(popup.id), "1");
    } else if (popup.display_frequency !== "every_visit") {
      localStorage.setItem(storageKey(popup.id), String(Date.now()));
    }
  } catch {
    // Ignore -- worst case the popup shows again next time.
  }
}

export function PopupHost({
  websiteId,
  pageId,
  workspaceSlug,
  websiteSlug,
  accentColor,
  firmName,
}: {
  websiteId: string;
  pageId: string;
  workspaceSlug: string;
  websiteSlug: string;
  accentColor?: string;
  firmName: string | null;
}) {
  const [allPopups, setAllPopups] = useState<ActivePopup[]>([]);
  const [queue, setQueue] = useState<ActivePopup[]>([]);
  const [visiblePopup, setVisiblePopup] = useState<ActivePopup | null>(null);
  const armedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.rpc("get_active_site_popups", { p_website_id: websiteId, p_page_id: pageId }).then(({ data }) => {
      if (cancelled || !data) return;
      const popups = data as unknown as ActivePopup[];
      setAllPopups(popups);
      setQueue(popups.filter((p) => !alreadyShown(p)));
    });
    return () => {
      cancelled = true;
    };
  }, [websiteId, pageId]);

  // Any link with href="#popup" opens the page's popup immediately, ignoring
  // frequency suppression -- a visitor who deliberately clicked a "Start your
  // trial" button should always see the form, whether or not they already
  // saw it fire automatically this session.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement | null)?.closest('a[href$="#popup"]');
      if (!target || allPopups.length === 0) return;
      e.preventDefault();
      setVisiblePopup(allPopups[0]);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [allPopups]);

  useEffect(() => {
    if (visiblePopup) return;
    const cleanups: (() => void)[] = [];

    function show(popup: ActivePopup) {
      if (armedIds.current.has(popup.id)) return;
      armedIds.current.add(popup.id);
      setVisiblePopup(popup);
      markShown(popup);
    }

    for (const popup of queue) {
      if (armedIds.current.has(popup.id)) continue;
      if (popup.trigger_type === "on_load") {
        show(popup);
        break;
      } else if (popup.trigger_type === "after_delay") {
        const timer = setTimeout(() => show(popup), Math.max(0, popup.trigger_value ?? 0) * 1000);
        cleanups.push(() => clearTimeout(timer));
      } else if (popup.trigger_type === "exit_intent") {
        const handler = (e: MouseEvent) => {
          if (e.clientY <= 0) show(popup);
        };
        document.addEventListener("mouseleave", handler);
        cleanups.push(() => document.removeEventListener("mouseleave", handler));
      } else if (popup.trigger_type === "scroll_percent") {
        const handler = () => {
          const scrollable = document.documentElement.scrollHeight - window.innerHeight;
          const pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 100;
          if (pct >= (popup.trigger_value ?? 100)) show(popup);
        };
        window.addEventListener("scroll", handler, { passive: true });
        cleanups.push(() => window.removeEventListener("scroll", handler));
      }
    }

    return () => cleanups.forEach((fn) => fn());
  }, [queue, visiblePopup]);

  if (!visiblePopup) return null;

  const ordered = [...visiblePopup.sections].sort((a, b) => a.display_order - b.display_order);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setVisiblePopup(null)}>
      {visiblePopup.custom_css && <style dangerouslySetInnerHTML={{ __html: visiblePopup.custom_css }} />}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl shadow-softHover"
        style={{ backgroundColor: visiblePopup.background_color || "#ffffff" }}
      >
        <button
          type="button"
          onClick={() => setVisiblePopup(null)}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-full bg-black/5 p-1.5 text-slate hover:bg-black/10"
        >
          <X size={16} />
        </button>
        {ordered.map((section) => (
          <SectionRenderer
            key={section.id}
            section={section}
            pageId={pageId}
            workspaceSlug={workspaceSlug}
            websiteSlug={websiteSlug}
            funnel={null}
            accentColor={accentColor}
            firmName={firmName}
          />
        ))}
      </div>
    </div>
  );
}
