"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { badgeClasses } from "@/components/ui/Badge";
import { BANK_PRODUCT_STATUS_TONE } from "@/lib/billingStatus";

const STATUSES = ["pending", "funded", "disbursed", "rejected"] as const;

export function BankProductStatusSelect({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    if (next === status) return;
    setSaving(true);
    const { error } = await supabase.from("bank_product_transactions").update({ status: next, disbursed_at: next === "disbursed" ? new Date().toISOString() : undefined }).eq("id", id);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <select
      value={status}
      onChange={(e) => change(e.target.value)}
      disabled={saving}
      className={badgeClasses(BANK_PRODUCT_STATUS_TONE[status] ?? "neutral", "cursor-pointer border-0 capitalize disabled:opacity-60")}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s} className="text-ink">
          {s}
        </option>
      ))}
    </select>
  );
}
