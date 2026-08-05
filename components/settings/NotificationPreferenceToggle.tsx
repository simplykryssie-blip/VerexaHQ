"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function NotificationPreferenceToggle({
  userId,
  workspaceId,
  eventType,
  channel,
  enabled,
}: {
  userId: string;
  workspaceId: string;
  eventType: string;
  channel: string;
  enabled: boolean;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const next = !isEnabled;
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(
        { user_id: userId, workspace_id: workspaceId, event_type: eventType, channel, enabled: next, updated_at: new Date().toISOString() },
        { onConflict: "user_id,workspace_id,event_type,channel" }
      );
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setIsEnabled(next);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isEnabled}
      onClick={toggle}
      disabled={saving}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${isEnabled ? "bg-accent" : "bg-surfaceMuted"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${isEnabled ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
