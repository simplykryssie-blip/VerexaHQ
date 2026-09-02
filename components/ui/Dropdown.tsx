"use client";

import { useEffect, useRef } from "react";

/**
 * The one place outside-click + Escape dismissal is implemented. Attach the
 * returned ref to the element that wraps BOTH the trigger and the panel --
 * a click on the trigger itself must not count as "outside."
 */
export function useDropdownDismiss<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  return ref;
}

/** Shadow-only floating panel chrome shared by every dropdown/menu in the app. */
export function DropdownPanel({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`absolute z-20 rounded-xl bg-surface shadow-softHover ${className}`}>{children}</div>;
}
