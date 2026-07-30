"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { formatDateTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";

export function PortalNotificationList({ clientId, notifications }: { clientId: string; notifications: Tables<"notifications">[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  function markRead(id: string) {
    startTransition(async () => {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      if (error) {
        toast.error(friendlyDbError(error.message));
        return;
      }
      router.refresh();
    });
  }

  function markAllRead() {
    startTransition(async () => {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("client_id", clientId).eq("is_read", false);
      if (error) {
        toast.error(friendlyDbError(error.message));
        return;
      }
      toast.success("All notifications marked read");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{unreadCount} unread</p>
        <Button size="sm" variant="outline" disabled={pending || unreadCount === 0} onClick={markAllRead}>
          <CheckCheck className="h-4 w-4" /> Mark all read
        </Button>
      </div>
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6 text-center">No notifications yet.</p>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className={cn("flex items-start gap-3 p-3", !n.is_read && "bg-brand/5")}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" />}
                  <p className="text-sm font-medium">{n.title}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {n.type.replace(/_/g, " ")}
                  </Badge>
                </div>
                {n.message && <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>}
                <p className="text-[10px] text-muted-foreground mt-1">{formatDateTime(n.created_at)}</p>
              </div>
              {!n.is_read && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => markRead(n.id)}>
                  <Check className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
