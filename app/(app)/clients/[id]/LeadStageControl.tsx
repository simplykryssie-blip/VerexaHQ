"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LeadStageControl({
  clientId,
  lifecycleStatus,
  stages,
}: {
  clientId: string;
  lifecycleStatus: string;
  stages: { key: string; label: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOnPipeline = stages.some((s) => s.key === lifecycleStatus);
  if (!isOnPipeline) return null;

  async function move(stageKey: string) {
    if (!stageKey || stageKey === lifecycleStatus) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.from("clients").update({ lifecycle_status: stageKey }).eq("id", clientId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={lifecycleStatus}
        onChange={(e) => move(e.target.value)}
        disabled={saving}
        className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-slate focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
      >
        {stages.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
