"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function PeerMessagingToggle({ workspaceId, initialAllowed }: { workspaceId: string; initialAllowed: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [allowed, setAllowed] = useState(initialAllowed);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !allowed;
    setAllowed(next);
    setSaving(true);
    const { error } = await supabase.from("workspaces").update({ allow_connected_ptin_messaging: next }).eq("id", workspaceId);
    setSaving(false);
    if (error) {
      setAllowed(!next);
      toast.show(error.message, "error");
      return;
    }
    toast.show(next ? "Connected PTINs can now message each other" : "Connected PTINs can no longer message each other", "success");
    router.refresh();
  }

  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={allowed} disabled={saving} onChange={toggle} className="mt-0.5 h-4 w-4 rounded border-border" />
      <span>
        <span className="font-medium text-ink">Let connected PTINs message each other</span>
        <span className="block text-xs text-muted">
          By default, connected PTINs can only message you. Turn this on to also let them start conversations with each other.
        </span>
      </span>
    </label>
  );
}
