"use client";

import { useEffect } from "react";

// Same script re-execution technique as CustomHtmlSection -- plain
// innerHTML never runs <script> tags, so each snippet is injected as a
// fresh, executable element instead. Head code (GA/GTM) is appended to
// document.head; body code (Facebook Pixel, other conversion pixels) is
// appended to the end of document.body, matching where these vendors
// normally ask a site owner to paste them.
function injectHtml(html: string, target: HTMLElement) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  Array.from(wrapper.childNodes).forEach((node) => {
    if (node.nodeName === "SCRIPT") {
      const oldScript = node as HTMLScriptElement;
      const newScript = document.createElement("script");
      for (const attr of Array.from(oldScript.attributes)) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.textContent = oldScript.textContent;
      target.appendChild(newScript);
    } else {
      target.appendChild(node);
    }
  });
}

export function TrackingScripts({ headCode, bodyCode }: { headCode: string | null; bodyCode: string | null }) {
  useEffect(() => {
    const injected: ChildNode[] = [];
    if (headCode) {
      const before = document.head.childNodes.length;
      injectHtml(headCode, document.head);
      injected.push(...Array.from(document.head.childNodes).slice(before));
    }
    if (bodyCode) {
      const before = document.body.childNodes.length;
      injectHtml(bodyCode, document.body);
      injected.push(...Array.from(document.body.childNodes).slice(before));
    }
    return () => {
      for (const node of injected) node.parentNode?.removeChild(node);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headCode, bodyCode]);

  return null;
}
