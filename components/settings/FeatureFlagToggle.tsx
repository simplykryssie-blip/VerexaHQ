"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function FeatureFlagToggle({ workspaceId, flagKey, enabled, disabled }: { workspaceId: string; flagKey: string; enabled: boolean; disabled?: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const { error } = await supabase.rpc("set_feature_flag", { p_workspace_id: workspaceId, p_flag_key: flagKey, p_enabled: !enabled });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={toggle}
      disabled={saving || disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition disabled:opacity-60 ${enabled ? "border-accent bg-accent" : "border-border bg-border"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${enabled ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
