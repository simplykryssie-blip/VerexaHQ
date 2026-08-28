"use client";

const ALPHA_THRESHOLD = 10;
const MAX_LOGO_DIMENSION = 512;
const FAVICON_SIZE = 128;

/**
 * Crops transparent padding off a canvas's content, alpha-channel-aware.
 * Shared by useTrimmedLogo (re-trims at render time, for surfaces that can
 * run this in the browser) and processLogoUpload below (bakes the trim into
 * the stored file, for surfaces -- email, favicon -- that can't).
 */
export function trimCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const { width, height } = source;
  const ctx = source.getContext("2d");
  if (!ctx) return source;
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

  const w = right - left + 1;
  const h = bottom - top + 1;
  const nothingToTrim = top === 0 && left === 0 && bottom === height - 1 && right === width - 1;
  if (nothingToTrim || w <= 0 || h <= 0) return source;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d");
  if (!outCtx) return source;
  outCtx.drawImage(source, left, top, w, h, 0, 0, w, h);
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image file"));
    img.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read this file"));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))), "image/png");
  });
}

export type ProcessedLogo = { full: Blob; favicon: Blob };

/**
 * The single upload-time processing pass behind One-Logo branding: trims
 * transparent padding, caps the full-size variant's longest edge (aspect
 * ratio preserved, so an oversized source never gets stretched or
 * pixelated when a surface renders it small), and generates a square,
 * padded favicon derivative. Favicons pad onto a square canvas rather than
 * just resizing, since squashing a wide wordmark into a square would
 * distort it.
 */
export async function processLogoUpload(file: File): Promise<ProcessedLogo> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const rawCanvas = document.createElement("canvas");
  rawCanvas.width = img.naturalWidth;
  rawCanvas.height = img.naturalHeight;
  const rawCtx = rawCanvas.getContext("2d");
  if (!rawCtx) throw new Error("Could not process this image");
  rawCtx.drawImage(img, 0, 0);

  const trimmed = trimCanvas(rawCanvas);

  const scale = Math.min(1, MAX_LOGO_DIMENSION / Math.max(trimmed.width, trimmed.height));
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = Math.max(1, Math.round(trimmed.width * scale));
  fullCanvas.height = Math.max(1, Math.round(trimmed.height * scale));
  const fullCtx = fullCanvas.getContext("2d");
  if (!fullCtx) throw new Error("Could not process this image");
  fullCtx.imageSmoothingQuality = "high";
  fullCtx.drawImage(trimmed, 0, 0, fullCanvas.width, fullCanvas.height);

  const faviconScale = Math.min(1, (FAVICON_SIZE * 0.86) / Math.max(trimmed.width, trimmed.height));
  const favW = Math.max(1, Math.round(trimmed.width * faviconScale));
  const favH = Math.max(1, Math.round(trimmed.height * faviconScale));
  const faviconCanvas = document.createElement("canvas");
  faviconCanvas.width = FAVICON_SIZE;
  faviconCanvas.height = FAVICON_SIZE;
  const faviconCtx = faviconCanvas.getContext("2d");
  if (!faviconCtx) throw new Error("Could not process this image");
  faviconCtx.imageSmoothingQuality = "high";
  faviconCtx.drawImage(trimmed, (FAVICON_SIZE - favW) / 2, (FAVICON_SIZE - favH) / 2, favW, favH);

  const [full, favicon] = await Promise.all([canvasToBlob(fullCanvas), canvasToBlob(faviconCanvas)]);
  return { full, favicon };
}
