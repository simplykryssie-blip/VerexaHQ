"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { ENGAGEMENT_STATUS_LABELS, engagementStatusLabel } from "@/lib/validation/engagements";
import type { Database } from "@/types/database";

type EngagementStatus = Database["public"]["Enums"]["engagement_status"];

export function EngagementStatusSelect({ engagementId, status }: { engagementId: string; status: EngagementStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    startTransition(async () => {
      const supabase = createClient();
      // engagement_status_history is populated automatically by this
      // project's own log_engagement_status_change() trigger — no manual
      // activity insert needed here.
      const { error } = await supabase
        .from("tax_engagements")
        .update({ status: next as EngagementStatus })
        .eq("id", engagementId);
      if (error) {
        toast.error(friendlyDbError(error.message));
        return;
      }
      toast.success("Status updated");
      router.refresh();
    });
  }

  return (
    <Select value={status} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.keys(ENGAGEMENT_STATUS_LABELS).map((s) => (
          <SelectItem key={s} value={s}>
            {engagementStatusLabel(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
