import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { NotificationPreferenceToggle } from "@/components/settings/NotificationPreferenceToggle";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { presentNotification, type NotificationRow } from "@/lib/notifications/present";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "accent",
  sent: "neutral",
  failed: "danger",
  cancelled: "neutral",
};

// Every (event_type, channel) pair actually gated by is_notification_enabled()
// for client/portal recipients.
const PREFERENCE_ROWS = [
  { eventType: "invoice_due", channel: "Email", label: "Invoice due reminders (Email)", description: "Get an email when an invoice is due within 3 days." },
  { eventType: "invoice_due", channel: "SMS", label: "Invoice due reminders (SMS)", description: "Text version of the above." },
  { eventType: "appointment_reminder", channel: "Email", label: "Appointment reminders (Email)", description: "Get an email before an upcoming appointment." },
  { eventType: "appointment_reminder", channel: "SMS", label: "Appointment reminders (SMS)", description: "Text version of the above." },
  { eventType: "payment_receipt", channel: "Email", label: "Payment receipts (Email)", description: "Get an email confirming a payment was received." },
];

export default async function PortalNotificationsPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: notifications }, { data: preferences }] = await Promise.all([
    supabase
      .from("notification_queue")
      .select("id, event_type, template_key, payload, entity_type, entity_id, channel, status, created_at, read_at")
      .eq("recipient_user_id", user?.id ?? "")
      .order("created_at", { ascending: false })
      .limit(100),
    user
      ? supabase
          .from("notification_preferences")
          .select("event_type, channel, enabled")
          .eq("user_id", user.id)
          .eq("workspace_id", identity.workspaceId)
      : Promise.resolve({ data: [] as { event_type: string; channel: string; enabled: boolean }[] }),
  ]);

  const prefMap = new Map((preferences ?? []).map((p) => [`${p.event_type}:${p.channel}`, p.enabled]));

  return (
    <>
      <PageHeader title="Notifications" description="Updates sent to you by your firm." />
      <div className="flex-1 space-y-6 px-8 py-6">
        <div className="divide-y divide-border rounded-xl border border-border bg-surface">
          {PREFERENCE_ROWS.map((row) => (
            <div key={`${row.eventType}:${row.channel}`} className="flex items-center justify-between gap-4 px-5 py-3">
              <div>
                <p className="text-sm font-medium text-ink">{row.label}</p>
                <p className="text-xs text-muted">{row.description}</p>
              </div>
              {user && (
                <NotificationPreferenceToggle
                  userId={user.id}
                  workspaceId={identity.workspaceId}
                  eventType={row.eventType}
                  channel={row.channel}
                  enabled={prefMap.get(`${row.eventType}:${row.channel}`) ?? true}
                />
              )}
            </div>
          ))}
        </div>
        {(notifications ?? []).length === 0 ? (
          <EmptyState message="No notifications yet." />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {(notifications ?? []).map((n) => {
              const { title } = presentNotification(n as NotificationRow);
              return (
                <li key={n.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-slate">{title}</p>
                    <p className="text-xs text-muted">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                  <Badge tone={STATUS_TONE[n.status] ?? "neutral"} className="capitalize">
                    {n.status}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
