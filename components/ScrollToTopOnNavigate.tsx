"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Next's built-in scroll restoration targets window.scrollY -- it does
// nothing for a custom scrollable container like <main id="main-content">
// (used so the sidebar/header stay fixed while only the page body scrolls).
// Without this, navigating to a new page keeps whatever scroll position the
// previous page was left at, which reads as "it opens at the bottom" on any
// page shorter than the one you came from.
export function ScrollToTopOnNavigate({ containerId }: { containerId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    document.getElementById(containerId)?.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, containerId]);

  return null;
}
