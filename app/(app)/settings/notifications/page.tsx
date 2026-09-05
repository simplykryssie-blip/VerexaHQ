import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { NotificationPreferenceToggle } from "@/components/settings/NotificationPreferenceToggle";
import { presentNotification, type NotificationRow } from "@/lib/notifications/present";

export const dynamic = 'force-dynamic';

// Every (event_type, channel) pair actually gated by is_notification_enabled()
// for staff recipients. signature_due and ENGAGEMENT_* aren't gated at all
// today, so they have no row here.
const PREFERENCE_ROWS = [
  // These fire automatically the moment the thing happens -- no Workflow to
  // build, nothing to configure. Bell icon only (In-App).
  { eventType: "DOCUMENT_REQUEST_COMPLETED", channel: "In-App", label: "A client finishes sending requested documents", description: "Notifies you the moment every document you asked for has come in." },
  { eventType: "ORGANIZER_SUBMITTED", channel: "In-App", label: "A client submits their intake form", description: "Notifies your firm's owners/admins that a client finished their organizer and it's ready to review." },
  { eventType: "ORGANIZER_REVIEWED", channel: "In-App", label: "A client's intake form gets reviewed", description: "Notifies you once a staff member approves or requests changes on a client's submitted organizer." },
  { eventType: "ORGANIZER_INFORMATION_RESPONDED", channel: "In-App", label: "A client responds to flagged questions", description: "Notifies the assigned reviewer once a client answers or corrects the questions you flagged on their organizer." },
  { eventType: "ORGANIZER_ERO_REVIEW_REQUESTED", channel: "In-App", label: "An organizer is sent to you for ERO review", description: "Notifies you when a reviewer sends a submitted organizer to you for ERO review." },
  { eventType: "PAYMENT_RECEIVED", channel: "In-App", label: "A payment comes in", description: "Notifies you any time a payment (any amount, any method) is recorded for one of your clients." },
  { eventType: "INVOICE_PAID", channel: "In-App", label: "An invoice is fully paid off", description: "Notifies you when an invoice's balance hits zero." },
  { eventType: "APPOINTMENT_BOOKED_ONLINE", channel: "In-App", label: "A client books an appointment online", description: "Notifies you the moment someone books through your public booking link or the client portal." },
  // Quote accepted/declined also gets a real email, not just the bell --
  // it's revenue-adjacent enough that most firms want to know even away
  // from the app, unlike the purely-in-app events above.
  { eventType: "quote_accepted", channel: "Email", label: "A client accepts a quote (Email)", description: "A client accepted a quote -- it's automatically turned into an invoice." },
  { eventType: "quote_declined", channel: "Email", label: "A client declines a quote (Email)", description: "A client declined a quote you sent them." },
  // Everything below are timed reminders sent by email/text ahead of a
  // deadline, not "something just happened" notices.
  { eventType: "workflow_stage_due", channel: "Email", label: "Workflow stage due soon (Email)", description: "A stage assigned to you is due within 2 days." },
  { eventType: "workflow_stage_due", channel: "SMS", label: "Workflow stage due soon (SMS)", description: "Text version of the above." },
  { eventType: "appointment_reminder", channel: "Email", label: "Appointment reminder (Email)", description: "An appointment assigned to you starts within a day." },
  { eventType: "appointment_reminder", channel: "SMS", label: "Appointment reminder (SMS)", description: "Text version of the above." },
  { eventType: "funds_received_reminder", channel: "Email", label: "Confirm funds received (Email)", description: "A check/ACH/wire invoice's expected deposit date has arrived." },
  { eventType: "funds_received_reminder", channel: "SMS", label: "Confirm funds received (SMS)", description: "Text version of the above." },
  { eventType: "subscription_renewal_reminder", channel: "Email", label: "Subscription renewal reminder (Email)", description: "Your firm's Verexa subscription renews in 7 days." },
  { eventType: "subscription_renewal_reminder", channel: "SMS", label: "Subscription renewal reminder (SMS)", description: "Text version of the above." },
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
      .select("id, event_type, template_key, payload, entity_type, entity_id, status, created_at, channels, read_at")
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
        <SettingsSectionHeader icon={Bell} title="Notification preferences" description="Choose what automatically notifies you -- bell alerts and email/text reminders. Everything is on by default; turn off anything you don't want." />
        {workspace ? (
          <div className="mt-4 divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
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
        <h2 className="font-display text-base font-semibold text-ink">Recent notifications</h2>
        <p className="mt-1 text-sm text-muted">
          Notifications queued for you. In-app entries here are the delivery surface for the &quot;In-App&quot; channel; email/SMS
          reminders send separately once the provider credentials above are configured. The bell in the top corner shows these live.
        </p>

        <div className="mt-4 rounded-2xl border border-border bg-surface shadow-soft">
          {!notifications || notifications.length === 0 ? (
            <EmptyState icon={Bell} message="No notifications yet." />
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => {
                const { title } = presentNotification(n as NotificationRow);
                return (
                  <li key={n.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className={n.read_at ? "text-slate" : "font-medium text-ink"}>{title}</span>
                    <span className="text-xs text-muted">{new Date(n.created_at).toLocaleString()}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
