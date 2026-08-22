"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function PortalQuoteActions({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  async function accept() {
    if (!window.confirm("Accept this quote?")) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("accept_quote", { p_quote_id: quoteId });
    setSubmitting(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Quote accepted -- your firm has been notified.", "success");
    router.refresh();
  }

  async function decline() {
    setSubmitting(true);
    const { error } = await supabase.rpc("decline_quote", { p_quote_id: quoteId, p_reason: reason.trim() || undefined });
    setSubmitting(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Quote declined.", "success");
    router.refresh();
  }

  if (declining) {
    return (
      <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
        <label className="block text-sm font-medium text-slate" htmlFor="decline_reason">
          Let your firm know why (optional)
        </label>
        <textarea
          id="decline_reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setDeclining(false);
              setReason("");
            }}
            className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={decline}
            disabled={submitting}
            className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-60"
          >
            {submitting ? "Declining..." : "Confirm decline"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={accept}
        disabled={submitting}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
      >
        Accept
      </button>
      <button
        type="button"
        onClick={() => setDeclining(true)}
        disabled={submitting}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
      >
        Decline
      </button>
    </div>
  );
}
