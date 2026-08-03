"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
  const [status, setStatus] = useState(currentStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
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
