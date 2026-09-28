"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import { useToast } from "@/components/Toast";
import { copyTextToClipboard } from "@/lib/clipboard";

const COPIED_DURATION_MS = 1500;

/** Small icon-only copy control for a single field's exact value -- e.g. one
 * cell of a DNS record row. Copies `value` verbatim (no trimming/normalizing),
 * flips to a checkmark for a moment to confirm, and reports a failure via the
 * existing toast system rather than silently doing nothing. `label` doubles
 * as the accessible name and the tooltip (e.g. "Copy DNS host"). */
export function CopyIconButton({ value, label, className = "" }: { value: string; label: string; className?: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleCopy(e: React.MouseEvent) {
    // Field-level copies live inside table rows/cards that can carry their
    // own click behavior elsewhere -- copying one field must never trigger
    // anything else on the row.
    e.stopPropagation();
    const ok = await copyTextToClipboard(value);
    if (!ok) {
      toast.show(`Couldn't copy -- your browser blocked clipboard access. Select the text and copy it manually.`, "error");
      return;
    }
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), COPIED_DURATION_MS);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className={`inline-flex shrink-0 items-center justify-center rounded p-1 text-muted transition hover:bg-surfaceMuted hover:text-accent ${className}`}
    >
      {copied ? <Check size={13} className="text-success" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  );
}

/** Text-button variant for the additive "Copy record" action -- copies a
 * full, formatted reference of the whole record. Never a substitute for the
 * per-field CopyIconButtons; only for when it's useful to grab everything at
 * once (e.g. pasting into a support ticket). */
export function CopyRecordButton({ text, className = "" }: { text: string; className?: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await copyTextToClipboard(text);
    if (!ok) {
      toast.show("Couldn't copy the record. Select the text and copy it manually.", "error");
      return;
    }
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), COPIED_DURATION_MS);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline ${className}`}
    >
      {copied ? (
        <>
          <Check size={12} className="text-success" aria-hidden="true" /> Copied!
        </>
      ) : (
        <>
          <Copy size={12} aria-hidden="true" /> Copy record
        </>
      )}
    </button>
  );
}
