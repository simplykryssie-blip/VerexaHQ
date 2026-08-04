import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: notifications } = await supabase
    .from("notification_queue")
    .select("id, event_type, status, created_at, channels")
    .eq("recipient_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-ink">Notifications</h2>
      <p className="mt-1 text-sm text-muted">
        Recent notifications queued for you. Delivery to email/SMS/push isn&apos;t wired up yet -- these are
        currently in-app only.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-surface">
        {!notifications || notifications.length === 0 ? (
          <EmptyState message="No notifications yet." />
        ) : (
          <ul className="divide-y divide-border">
            {notifications.map((n) => (
              <li key={n.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-slate">{n.event_type ?? "Notification"}</span>
                <span className="text-xs text-muted">{new Date(n.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
