"use client";

import { useEffect, useRef, useState } from "react";

// Renders staff-pasted HTML for real inside the staff-facing builder canvas
// -- unlike SectionPreview's other cases, this one actually needs the code
// to run so staff can see it work (an embed, a script-driven widget) while
// they're building. Safe to do only because of the sandbox attribute: with
// "allow-scripts" but *not* "allow-same-origin", the iframe's content lives
// on a unique opaque origin with no access to this page's cookies, session,
// or DOM -- a malicious or just broken snippet can run its own script, but
// it can't touch anything belonging to the authenticated staff app around it.
//
// The iframe self-reports its real content height via postMessage so it can
// grow to fit whatever's actually in it (a full-bleed hero, a tall footer)
// instead of a fixed-size box -- a fixed height made every custom_html
// section look like a bounded widget in a little frame, nothing like how it
// actually renders once published.
//
// customCss is the page's own custom_css (Page Settings), the same field
// PublicSitePage injects into the live page's <head>. Many real designs
// (anything that splits a shared stylesheet from per-section markup, the
// way HTML-based sites typically do) rely on it entirely -- without it,
// classes like "mkbi-header" resolve to nothing and an unconstrained <img>
// logo renders at its native pixel size, filling the whole preview. The
// outer app already injects page.custom_css into its own DOM for the other
// section types, but that has no effect inside this iframe's separate
// document, so it's repeated here explicitly.
export function SandboxedHtmlPreview({ html, customCss }: { html: string; customCss?: string | null }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === "vx-preview-height" && typeof e.data.height === "number") {
        setHeight(e.data.height);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const resizeScript = `<script>(function(){function post(){parent.postMessage({type:"vx-preview-height",height:document.documentElement.scrollHeight},"*")}new ResizeObserver(post).observe(document.documentElement);window.addEventListener("load",post);post();})();</script>`;
  const srcDoc = `${customCss ? `<style>${customCss}</style>` : ""}${html}${resizeScript}`;

  return <iframe ref={iframeRef} srcDoc={srcDoc} sandbox="allow-scripts" title="Custom HTML preview" style={{ height }} className="w-full border-0" />;
}
