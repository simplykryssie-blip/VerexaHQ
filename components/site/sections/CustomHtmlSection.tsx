"use client";

import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";

type CustomHtmlConfig = { html?: string };

type MenuClassList = {
  contains(token: string): boolean;
  toggle(token: string, force?: boolean): boolean;
};

type MenuButtonLike = {
  setAttribute(name: string, value: string): void;
  textContent: string | null;
};

type MenuPanelLike = { classList: MenuClassList };

const MENU_BUTTON_SELECTOR = 'button#menuBtn, button[aria-label="Toggle menu"]';
const MENU_PANEL_SELECTOR = '#mobileNav, nav[aria-label="Mobile navigation"]';

/** Apply the standard menu state only when the page's own script did not. */
export function applyMobileMenuFallbackState(
  button: MenuButtonLike,
  panel: MenuPanelLike,
  shouldOpen: boolean
) {
  if (panel.classList.contains("open") === shouldOpen) return;

  panel.classList.toggle("open", shouldOpen);
  button.setAttribute("aria-expanded", String(shouldOpen));
  button.textContent = shouldOpen ? "×" : "☰";
}

// Plain innerHTML never executes <script> tags (a deliberate browser
// safeguard) -- re-inserting each one as a fresh script element is the
// standard trick every "custom code" website-builder widget uses so real
// embeds (Calendly, a tracking pixel, etc.) actually run. Only wired up on
// this public route -- see SectionPreview.tsx for why the staff-facing
// builder canvas deliberately shows a static placeholder instead.
export function CustomHtmlSection({ config }: { config: CustomHtmlConfig }) {
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scripts = Array.from(container.querySelectorAll("script"));
    for (const oldScript of scripts) {
      const newScript = document.createElement("script");
      for (const attr of Array.from(oldScript.attributes)) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.textContent = oldScript.textContent;
      oldScript.replaceWith(newScript);
    }
  }, [config.html]);

  const handleClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    const root = containerRef.current;
    const target = event.target;
    if (!root || !(target instanceof Element)) return;

    const clickedButton = target.closest<HTMLButtonElement>(MENU_BUTTON_SELECTOR);
    if (!clickedButton || !root.contains(clickedButton)) return;

    const initialPanel = root.querySelector<HTMLElement>(MENU_PANEL_SELECTOR);
    if (!initialPanel) return;

    // The custom script normally toggles these elements. Defer the fallback
    // until click handlers have run; this avoids double-toggling working menus,
    // while repairing a handler lost when React hydrates/reconciles custom HTML.
    const shouldOpen = !initialPanel.classList.contains("open");
    queueMicrotask(() => {
      const liveButton = root.querySelector<HTMLButtonElement>(MENU_BUTTON_SELECTOR);
      const livePanel = root.querySelector<HTMLElement>(MENU_PANEL_SELECTOR);
      if (liveButton && livePanel) {
        applyMobileMenuFallbackState(liveButton, livePanel, shouldOpen);
      }
    });
  };

  if (!config.html) return null;
  // eslint-disable-next-line react/no-danger
  return (
    <section
      ref={containerRef}
      onClickCapture={handleClickCapture}
      className="mx-auto max-w-5xl px-6 py-8"
      dangerouslySetInnerHTML={{ __html: config.html }}
    />
  );
}
