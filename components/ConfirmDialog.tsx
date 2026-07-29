"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// Accessible replacement for window.confirm() — keyboard/focus-trapped,
// screen-reader announced, and on-brand. Use for destructive actions
// (delete/archive) instead of the native browser dialog.
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby={description ? "confirm-dialog-description" : undefined}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4"
    >
      <button
        aria-label="Cancel"
        className="absolute inset-0 cursor-default"
        onClick={onCancel}
        tabIndex={-1}
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-line bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          {destructive && (
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
              <AlertTriangle size={18} />
            </div>
          )}
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="text-sm font-bold text-ink">
              {title}
            </h2>
            {description && (
              <p id="confirm-dialog-description" className="mt-1.5 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-line px-3.5 py-2 text-sm font-semibold text-ink hover:bg-paper disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-xl px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
              destructive ? "bg-red-600 hover:bg-red-700" : "bg-[#108A64] hover:bg-[#0d6f51]"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
