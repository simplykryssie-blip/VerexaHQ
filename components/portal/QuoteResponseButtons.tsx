"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function QuoteResponseButtons({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();
  const [loading, setLoading] = useState<"accept" | "decline" | null>(null);

  async function accept() {
    if (!window.confirm("Accept this quote?")) return;
    setLoading("accept");
    const { error } = await supabase.rpc("accept_quote", { p_quote_id: quoteId });
    setLoading(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Quote accepted.", "success");
    router.refresh();
  }

  async function decline() {
    const reason = window.prompt("Let your firm know why you're declining (optional):") ?? undefined;
    setLoading("decline");
    const { error } = await supabase.rpc("decline_quote", { p_quote_id: quoteId, p_reason: reason || undefined });
    setLoading(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Quote declined.", "success");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={loading !== null}
        onClick={accept}
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
      >
        {loading === "accept" ? "Accepting..." : "Accept"}
      </button>
      <button
        type="button"
        disabled={loading !== null}
        onClick={decline}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-danger disabled:opacity-60"
      >
        {loading === "decline" ? "Declining..." : "Decline"}
      </button>
    </div>
  );
}
