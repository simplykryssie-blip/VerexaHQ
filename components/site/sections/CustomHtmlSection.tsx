"use client";

import { useEffect, useRef } from "react";

type CustomHtmlConfig = { html?: string };

// Plain innerHTML never executes <script> tags (a deliberate browser
// safeguard) -- re-inserting each one as a fresh script element is the
// standard trick every "custom code" website-builder widget uses so real
// embeds (Calendly, a tracking pixel, etc.) actually run. Only wired up on
// this public route -- see SectionPreview.tsx for why the staff-facing
// builder canvas deliberately shows a static placeholder instead.
export function CustomHtmlSection({ config }: { config: CustomHtmlConfig }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const scripts = Array.from(containerRef.current.querySelectorAll("script"));
    for (const oldScript of scripts) {
      const newScript = document.createElement("script");
      for (const attr of Array.from(oldScript.attributes)) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.textContent = oldScript.textContent;
      oldScript.replaceWith(newScript);
    }
  }, [config.html]);

  if (!config.html) return null;
  // eslint-disable-next-line react/no-danger
  return <section ref={containerRef} className="mx-auto max-w-5xl px-6 py-8" dangerouslySetInnerHTML={{ __html: config.html }} />;
}
