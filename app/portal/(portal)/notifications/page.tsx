import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { NotificationPreferenceToggle } from "@/components/settings/NotificationPreferenceToggle";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  pending: "text-accent",
  sent: "text-muted",
  failed: "text-danger",
  cancelled: "text-muted",
};

export default async function PortalNotificationsPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: notifications }, { data: preference }] = await Promise.all([
    supabase
      .from("notification_queue")
      .select("id, event_type, template_key, channel, status, created_at")
      .eq("recipient_user_id", user?.id ?? "")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("notification_preferences")
      .select("enabled")
      .eq("user_id", user?.id ?? "")
      .eq("workspace_id", identity.workspaceId)
      .eq("event_type", "invoice_due")
      .eq("channel", "Email")
      .maybeSingle(),
  ]);

  return (
    <>
      <PageHeader title="Notifications" description="Updates sent to you by your firm." />
      <div className="flex-1 space-y-6 px-8 py-6">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-5 py-3">
          <div>
            <p className="text-sm font-medium text-ink">Invoice due reminders</p>
            <p className="text-xs text-muted">Get an email when an invoice is due within 3 days.</p>
          </div>
          {user && (
            <NotificationPreferenceToggle
              userId={user.id}
              workspaceId={identity.workspaceId}
              eventType="invoice_due"
              channel="Email"
              enabled={preference?.enabled ?? true}
            />
          )}
        </div>
        {(notifications ?? []).length === 0 ? (
          <EmptyState message="No notifications yet." />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {(notifications ?? []).map((n) => (
              <li key={n.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate">{(n.event_type ?? n.template_key).replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted">{new Date(n.created_at).toLocaleString()}</p>
                </div>
                <span className={`text-xs capitalize ${STATUS_STYLE[n.status] ?? "text-muted"}`}>{n.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
