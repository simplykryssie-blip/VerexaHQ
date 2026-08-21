"use client";

import { useEffect, useState } from "react";

const ALPHA_THRESHOLD = 10;

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
        const { naturalWidth: width, naturalHeight: height } = img;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, width, height);

        const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3];
        const rowHasContent = (y: number) => {
          for (let x = 0; x < width; x++) if (alphaAt(x, y) > ALPHA_THRESHOLD) return true;
          return false;
        };
        const colHasContent = (x: number) => {
          for (let y = 0; y < height; y++) if (alphaAt(x, y) > ALPHA_THRESHOLD) return true;
          return false;
        };

        let top = 0;
        let bottom = height - 1;
        let left = 0;
        let right = width - 1;
        while (top < height && !rowHasContent(top)) top++;
        while (bottom > top && !rowHasContent(bottom)) bottom--;
        while (left < width && !colHasContent(left)) left++;
        while (right > left && !colHasContent(right)) right--;

        const nothingToTrim = top === 0 && left === 0 && bottom === height - 1 && right === width - 1;
        const w = right - left + 1;
        const h = bottom - top + 1;
        if (nothingToTrim || w <= 0 || h <= 0) return;

        const out = document.createElement("canvas");
        out.width = w;
        out.height = h;
        const outCtx = out.getContext("2d");
        if (!outCtx) return;
        outCtx.drawImage(canvas, left, top, w, h, 0, 0, w, h);
        if (!cancelled) setTrimmedSrc(out.toDataURL("image/png"));
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
