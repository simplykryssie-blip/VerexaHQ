"use client";

import { useRef } from "react";

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 160;

export type SignatureMode = "typed" | "drawn";

/** A type-or-draw toggle for capturing an electronic signature -- reused by
 * every client-facing signing flow (engagement letters, generic document
 * signing, the organizer signature field) so the experience is consistent
 * everywhere someone has to sign something. Only the active mode's value is
 * meant to be submitted; the caller owns gating submit on it. */
export function SignaturePad({
  mode,
  onModeChange,
  typedName,
  onTypedNameChange,
  onDrawnChange,
  typedLabel = "Type your full name to sign electronically",
}: {
  mode: SignatureMode;
  onModeChange: (mode: SignatureMode) => void;
  typedName: string;
  onTypedNameChange: (value: string) => void;
  onDrawnChange: (dataUrl: string | null) => void;
  typedLabel?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawingRef.current = true;
    hasDrawnRef.current = true;
    const { x, y } = getPos(e);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    onDrawnChange(canvas && hasDrawnRef.current ? canvas.toDataURL("image/png") : null);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
    onDrawnChange(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-surfaceMuted p-1 text-xs font-medium">
        <button
          type="button"
          onClick={() => onModeChange("typed")}
          className={`flex-1 rounded-md px-2 py-1.5 transition ${mode === "typed" ? "bg-surface text-accent shadow-sm" : "text-muted"}`}
        >
          Type
        </button>
        <button
          type="button"
          onClick={() => onModeChange("drawn")}
          className={`flex-1 rounded-md px-2 py-1.5 transition ${mode === "drawn" ? "bg-surface text-accent shadow-sm" : "text-muted"}`}
        >
          Draw
        </button>
      </div>

      {mode === "typed" ? (
        <div>
          <label htmlFor="typed-signature" className="block text-sm font-medium text-ink">
            {typedLabel}
          </label>
          <input
            id="typed-signature"
            value={typedName}
            onChange={(e) => onTypedNameChange(e.target.value)}
            placeholder="Full name"
            className="mt-2 w-full rounded-lg border border-border px-3 py-2 font-serif text-lg italic focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      ) : (
        <div>
          <p className="text-sm font-medium text-ink">Draw your signature below</p>
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            style={{ touchAction: "none" }}
            className="mt-2 w-full cursor-crosshair rounded-lg border border-border bg-white"
          />
          <button type="button" onClick={clear} className="mt-1.5 text-xs font-medium text-muted hover:text-ink">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
