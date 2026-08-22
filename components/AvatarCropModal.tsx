"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";

const VIEWPORT = 280;
const OUTPUT = 480;

export function AvatarCropModal({
  file,
  onCancel,
  onCropped,
}: {
  file: File;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [baseScale, setBaseScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origin: { x: number; y: number } } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleImageLoad() {
    const img = imgRef.current;
    if (!img) return;
    // At zoom 1, the image's shorter side exactly fills the square viewport --
    // same idea as CSS object-fit: cover, computed manually because the pan/zoom
    // math below needs the actual pixel scale, not just a CSS keyword.
    const scale = VIEWPORT / Math.min(img.naturalWidth, img.naturalHeight);
    setBaseScale(scale);
    setOffset({ x: 0, y: 0 });
  }

  function clampOffset(x: number, y: number, currentZoom: number) {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const drawW = img.naturalWidth * baseScale * currentZoom;
    const drawH = img.naturalHeight * baseScale * currentZoom;
    const maxX = Math.max(0, (drawW - VIEWPORT) / 2);
    const maxY = Math.max(0, (drawH - VIEWPORT) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }

  function startDrag(clientX: number, clientY: number) {
    dragRef.current = { startX: clientX, startY: clientY, origin: offset };
  }

  function moveDrag(clientX: number, clientY: number) {
    if (!dragRef.current) return;
    const { startX, startY, origin } = dragRef.current;
    setOffset(clampOffset(origin.x + (clientX - startX), origin.y + (clientY - startY), zoom));
  }

  function endDrag() {
    dragRef.current = null;
  }

  function changeZoom(next: number) {
    setZoom(next);
    setOffset((prev) => clampOffset(prev.x, prev.y, next));
  }

  function apply() {
    const img = imgRef.current;
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const outputRatio = OUTPUT / VIEWPORT;
    const drawW = img.naturalWidth * baseScale * zoom * outputRatio;
    const drawH = img.naturalHeight * baseScale * zoom * outputRatio;
    const drawX = (OUTPUT - drawW) / 2 + offset.x * outputRatio;
    const drawY = (OUTPUT - drawH) / 2 + offset.y * outputRatio;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    canvas.toBlob((blob) => blob && onCropped(blob), "image/jpeg", 0.9);
  }

  return (
    <Modal title="Adjust photo" onClose={onCancel}>
      <div className="space-y-4">
        <div
          className="relative mx-auto overflow-hidden rounded-full border border-border bg-surfaceMuted"
          style={{ width: VIEWPORT, height: VIEWPORT, cursor: "grab", touchAction: "none" }}
          onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
          onMouseMove={(e) => e.buttons === 1 && moveDrag(e.clientX, e.clientY)}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => moveDrag(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={endDrag}
        >
          {src && (
            // eslint-disable-next-line @next/next/no-img-element -- rendered to an off-DOM canvas for cropping, not the Next.js image pipeline.
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={handleImageLoad}
              className="absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: imgRef.current ? imgRef.current.naturalWidth * baseScale * zoom : undefined,
                height: imgRef.current ? imgRef.current.naturalHeight * baseScale * zoom : undefined,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            className="flex-1"
          />
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={apply} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90">
            Save photo
          </button>
        </div>
      </div>
    </Modal>
  );
}
