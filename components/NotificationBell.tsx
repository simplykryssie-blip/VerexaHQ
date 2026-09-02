"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { presentNotification, type NotificationRow } from "@/lib/notifications/present";
import { IconButton } from "@/components/ui/IconButton";
import { DropdownPanel, useDropdownDismiss } from "@/components/ui/Dropdown";

const POLL_INTERVAL_MS = 60_000;

export function NotificationBell({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const containerRef = useDropdownDismiss<HTMLDivElement>(open, () => setOpen(false));

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notification_queue")
      .select("id, event_type, template_key, payload, entity_type, entity_id, created_at, read_at")
      .eq("recipient_user_id", userId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications((data as NotificationRow[] | null) ?? []);
  }, [supabase, userId, workspaceId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function handleClick(n: NotificationRow) {
    if (!n.read_at) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      await supabase.rpc("mark_notification_read", { p_notification_id: n.id });
    }
    const { href } = presentNotification(n);
    setOpen(false);
    if (href) router.push(href);
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    await supabase.rpc("mark_all_notifications_read", { p_workspace_id: workspaceId });
  }

  return (
    <div ref={containerRef} className="relative">
      <IconButton variant="default" onClick={() => setOpen((v) => !v)} aria-label="Notifications" className="relative rounded-full">
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </IconButton>

      {open && (
        <DropdownPanel className="right-0 top-full mt-2 w-80">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs font-medium text-accent hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((n) => {
                  const { title, href } = presentNotification(n);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleClick(n)}
                        className={`block w-full px-4 py-3 text-left text-sm hover:bg-surfaceMuted ${!n.read_at ? "bg-accentSoft/40" : ""} ${
                          href ? "cursor-pointer" : "cursor-default"
                        }`}
                      >
                        <span className={`block ${!n.read_at ? "font-medium text-ink" : "text-slate"}`}>{title}</span>
                        <span className="mt-0.5 block text-xs text-muted">{new Date(n.created_at).toLocaleString()}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DropdownPanel>
      )}
    </div>
  );
}
