"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Mirrors the early_access_announcements_member_read RLS policy: published,
// not yet expired, and (no target list or this workspace is in it). The
// select already only returns rows the workspace is allowed to see, so this
// is just "visible minus already read."
export function useUnreadAnnouncementCount(workspaceId: string | null, campaignId: string | null) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!workspaceId || !campaignId) {
      setCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const nowIso = new Date().toISOString();
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) return;

      const { data: visible } = await supabase
        .from("early_access_announcements")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("status", "published")
        .lte("published_at", nowIso)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

      if (cancelled || !visible) return;
      const visibleIds = visible.map((a) => a.id as string);
      if (visibleIds.length === 0) {
        setCount(0);
        return;
      }

      const { data: reads } = await supabase
        .from("early_access_announcement_reads")
        .select("announcement_id")
        .eq("user_id", userId)
        .in("announcement_id", visibleIds);

      if (cancelled) return;
      const readIds = new Set((reads ?? []).map((r) => r.announcement_id as string));
      setCount(visibleIds.filter((id) => !readIds.has(id)).length);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, campaignId]);

  return count;
}
