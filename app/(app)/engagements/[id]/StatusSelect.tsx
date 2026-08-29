"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function StatusSelect({
  engagementId,
  currentStatus,
  options,
}: {
  engagementId: string;
  currentStatus: string;
  options: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [status, setStatus] = useState(currentStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const SIGNATURE_GATED_STATUSES = ["Waiting On Payment", "Ready To Release", "Completed"];
  const PAYMENT_GATED_STATUSES = ["Ready To Release", "Completed"];

  async function handleChange(next: string) {
    if (SIGNATURE_GATED_STATUSES.includes(next)) {
      const { data: hasSignedLetter } = await supabase.rpc("engagement_has_signed_letter", { p_engagement_id: engagementId });
      if (!hasSignedLetter) {
        const proceed = window.confirm(
          `This engagement doesn't have a completed, signed engagement letter on file. Move it to "${next}" anyway?`
        );
        if (!proceed) return;
      }
    }

    if (PAYMENT_GATED_STATUSES.includes(next)) {
      const { data: paymentOk } = await supabase.rpc("engagement_meets_payment_requirement", { p_engagement_id: engagementId });
      if (!paymentOk) {
        const proceed = window.confirm(
          `This engagement's service requires payment before release, and there's no paid invoice on file. Move it to "${next}" anyway?`
        );
        if (!proceed) return;
      }
    }

    setStatus(next);
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("engagements").update({ status: next }).eq("id", engagementId);
    setSaving(false);
    if (error) {
      setError(error.message);
      setStatus(currentStatus);
      return;
    }
    toast.show("Status updated", "success");
    router.refresh();
  }

  return (
    <div>
      <select
        value={status}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-slate focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
