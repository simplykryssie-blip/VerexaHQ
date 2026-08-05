"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function DueDateInput({ engagementId, currentDueDate }: { engagementId: string; currentDueDate: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [dueDate, setDueDate] = useState(currentDueDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    setDueDate(next);
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("engagements").update({ due_date: next || null }).eq("id", engagementId);
    setSaving(false);
    if (error) {
      setError(error.message);
      setDueDate(currentDueDate ?? "");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <input
        type="date"
        value={dueDate}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-lg border border-border px-2 py-1 text-sm text-slate focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
