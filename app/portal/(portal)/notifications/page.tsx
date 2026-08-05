import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

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

  const { data: notifications } = await supabase
    .from("notification_queue")
    .select("id, event_type, template_key, channel, status, created_at")
    .eq("recipient_user_id", user?.id ?? "")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader title="Notifications" description="Updates sent to you by your firm." />
      <div className="flex-1 px-8 py-6">
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
