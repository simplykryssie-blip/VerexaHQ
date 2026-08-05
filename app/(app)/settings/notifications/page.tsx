import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { EmptyState } from "@/components/EmptyState";
import { NotificationPreferenceToggle } from "@/components/settings/NotificationPreferenceToggle";

export const dynamic = 'force-dynamic';

const PREFERENCE_ROWS = [
  { eventType: "workflow_stage_due", channel: "Email", label: "Workflow stage due soon", description: "A stage assigned to you is due within 2 days." },
];

export default async function NotificationsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const workspace = await getCurrentWorkspace();

  const [{ data: notifications }, { data: preferences }] = await Promise.all([
    supabase
      .from("notification_queue")
      .select("id, event_type, status, created_at, channels")
      .eq("recipient_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    workspace
      ? supabase.from("notification_preferences").select("event_type, channel, enabled").eq("user_id", user.id).eq("workspace_id", workspace.id)
      : Promise.resolve({ data: [] as { event_type: string; channel: string; enabled: boolean }[] }),
  ]);

  const prefMap = new Map((preferences ?? []).map((p) => [`${p.event_type}:${p.channel}`, p.enabled]));

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-base font-semibold text-ink">Reminder preferences</h2>
        <p className="mt-1 text-sm text-muted">Choose which automated reminders you receive by email. On by default.</p>
        {workspace ? (
          <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface">
            {PREFERENCE_ROWS.map((row) => (
              <div key={`${row.eventType}:${row.channel}`} className="flex items-center justify-between gap-4 px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{row.label}</p>
                  <p className="text-xs text-muted">{row.description}</p>
                </div>
                <NotificationPreferenceToggle
                  userId={user.id}
                  workspaceId={workspace.id}
                  eventType={row.eventType}
                  channel={row.channel}
                  enabled={prefMap.get(`${row.eventType}:${row.channel}`) ?? true}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">No workspace found.</p>
        )}
      </div>

      <div>
        <h2 className="text-base font-semibold text-ink">Recent notifications</h2>
        <p className="mt-1 text-sm text-muted">
          Notifications queued for you. In-app entries here are the delivery surface for the &quot;In-App&quot; channel; email/SMS
          reminders send separately once the provider credentials above are configured.
        </p>

        <div className="mt-4 rounded-xl border border-border bg-surface">
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
    </div>
  );
}
