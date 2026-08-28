"use client";

import { useEffect, useState } from "react";
import { trimCanvas } from "@/lib/logoProcessing";

/**
 * Uploaded firm logos are often exported with transparent padding around the
 * mark, which makes them render tiny inside a fixed-height box even though
 * the box itself is sized generously. This crops that padding client-side
 * (once per URL, browser-cached after) so every workspace's logo fills its
 * box regardless of how the source file was exported. Falls back to the
 * original URL untouched if the image has no transparency to trim, or if the
 * canvas read fails (e.g. the asset host doesn't send CORS headers).
 */
export function useTrimmedLogo(src: string | null | undefined): string | null {
  const [trimmedSrc, setTrimmedSrc] = useState<string | null>(src ?? null);

  useEffect(() => {
    if (!src) {
      setTrimmedSrc(null);
      return;
    }
    setTrimmedSrc(src);

    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);

        const trimmed = trimCanvas(canvas);
        if (trimmed === canvas) return; // nothing to trim
        if (!cancelled) setTrimmedSrc(trimmed.toDataURL("image/png"));
      } catch {
        // Tainted canvas (no CORS headers) or other read failure -- keep the
        // original URL, which still renders, just without the trim.
      }
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return trimmedSrc;
}
