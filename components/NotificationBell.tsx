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

  // Deliberately not scoped to the current workspace -- a notification
  // whose entity lives in a workspace other than whatever's currently
  // active would otherwise be invisible here even though it's real (e.g.
  // a marketing-site lead-capture submission landing in the platform-home
  // workspace while the viewer has a different workspace active). RLS
  // (notification_queue_select) already scopes every row to the caller's
  // own recipient_user_id regardless of workspace, so this is just
  // trusting that same boundary instead of narrowing it further client-side.
  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notification_queue")
      .select("id, event_type, template_key, payload, entity_type, entity_id, workspace_id, created_at, read_at")
      .eq("recipient_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications((data as NotificationRow[] | null) ?? []);
  }, [supabase, userId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  // If the notification's own workspace isn't the one currently active,
  // switch to it first -- most destination pages (e.g. /clients/[id])
  // resolve their data against the active workspace, so navigating there
  // without switching would 404 or show someone else's record instead.
  // A hard navigation (not router.push) after switching, since the active
  // workspace drives server-rendered layout data that a soft nav wouldn't
  // re-fetch -- matches how Sidebar's own workspace switcher does it.
  async function handleClick(n: NotificationRow) {
    if (!n.read_at) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      await supabase.rpc("mark_notification_read", { p_notification_id: n.id });
    }
    const { href } = presentNotification(n);
    setOpen(false);
    if (!href) return;

    if (n.workspace_id && n.workspace_id !== workspaceId) {
      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: n.workspace_id }),
      });
      if (res.ok) {
        window.location.href = href;
        return;
      }
      // Switch failed (e.g. no longer a member) -- fall through to a plain
      // in-app nav, which fails the same way this always has.
    }
    router.push(href);
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    const workspaceIds = Array.from(new Set(notifications.map((n) => n.workspace_id).filter((id): id is string => Boolean(id))));
    await Promise.all(workspaceIds.map((id) => supabase.rpc("mark_all_notifications_read", { p_workspace_id: id })));
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
