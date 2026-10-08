"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function EroCapabilityToggle({ workspaceId, enabled, canToggle }: { workspaceId: string; enabled: boolean; canToggle: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const { error } = await supabase.rpc("set_ero_capability_enabled", { p_workspace_id: workspaceId, p_enabled: !enabled });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(!enabled ? "Client/engagement book enabled." : "Client/engagement book disabled.", "success");
    router.refresh();
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={toggle}
      disabled={saving || !canToggle}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition disabled:opacity-60 ${enabled ? "border-accent bg-accent" : "border-border bg-border"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${enabled ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
