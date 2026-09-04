"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

// A cancelled quote (auto-cancelled 24hrs past its due date, or manually
// cancelled) has no other path back -- this puts it back to 'sent' with a
// fresh 14-day due date so the client can respond again. Any automation run
// parked on a "quote accepted or declined?" condition step re-evaluates on
// its own once the quote's status changes again, no separate signal needed.
export function ReactivateQuoteButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function reactivate() {
    setSaving(true);
    const freshDueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { error } = await supabase
      .from("quotes")
      .update({ status: "sent", valid_until: freshDueDate, cancelled_at: null, sent_at: new Date().toISOString() })
      .eq("id", quoteId);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Quote reactivated", "success");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={reactivate}
      disabled={saving}
      className="text-xs font-medium text-accent hover:underline disabled:opacity-60"
    >
      {saving ? "Reactivating..." : "Reactivate"}
    </button>
  );
}
