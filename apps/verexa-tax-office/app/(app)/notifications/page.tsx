import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { getNotifications, getReminders } from "@/features/notifications/queries";
import { NotificationList } from "@/features/notifications/notification-list";
import { reminderStatusLabel, outboxChannelLabel } from "@/lib/validation/notifications";
import { formatDateTime } from "@/lib/formatters";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "notifications" } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user!.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const workspaceId = membership!.workspace_id;

  const [notifications, reminders] = await Promise.all([
    getNotifications(workspaceId),
    tab === "reminders" || tab === "scheduled" ? getReminders(workspaceId, tab === "scheduled" ? { status: "scheduled" } : undefined) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground mt-1">Workspace notifications, reminder history, and scheduled reminders.</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button asChild variant={tab === "notifications" ? "secondary" : "ghost"} size="sm">
          <Link href="/notifications?tab=notifications">Notifications</Link>
        </Button>
        <Button asChild variant={tab === "reminders" ? "secondary" : "ghost"} size="sm">
          <Link href="/notifications?tab=reminders">Reminder history</Link>
        </Button>
        <Button asChild variant={tab === "scheduled" ? "secondary" : "ghost"} size="sm">
          <Link href="/notifications?tab=scheduled">Scheduled reminders</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/communication-history">Communication history →</Link>
        </Button>
      </div>

      {tab === "notifications" && <NotificationList workspaceId={workspaceId} notifications={notifications} />}

      {(tab === "reminders" || tab === "scheduled") && (
        <div className="rounded-lg border border-border bg-card">
          {reminders.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">No reminders here.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled for</TableHead>
                  <TableHead>Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reminders.map((r) => {
                  const client = r.client as { first_name?: string; last_name?: string; company?: string } | null;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{client?.company || `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim() || "—"}</TableCell>
                      <TableCell className="text-xs">{r.reminder_type.replace(/_/g, " ")}</TableCell>
                      <TableCell>{outboxChannelLabel(r.channel)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={r.status === "failed" ? "destructive" : r.status === "sent" ? "success" : r.status === "skipped" || r.status === "cancelled" ? "outline" : "secondary"}
                        >
                          {reminderStatusLabel(r.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{formatDateTime(r.scheduled_for)}</TableCell>
                      <TableCell className="text-xs">{formatDateTime(r.sent_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
