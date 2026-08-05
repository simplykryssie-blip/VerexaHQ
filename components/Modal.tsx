"use client";

import { useEffect, useRef } from "react";

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/30 px-4 py-8"
      onClick={(e) => {
        if (!contentRef.current?.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
            Cancel
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
