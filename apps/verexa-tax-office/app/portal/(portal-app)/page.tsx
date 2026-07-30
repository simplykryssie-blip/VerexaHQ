import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, FileText, CalendarDays, Receipt, PenTool, Bell } from "lucide-react";
import { getPortalContext } from "@/lib/auth/portal";
import { getPortalDashboardSummary } from "@/features/portal/queries";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/formatters";
import { intakeStatusLabel } from "@/lib/validation/intake";

export default async function PortalDashboardPage() {
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  const summary = await getPortalDashboardSummary(context.client.id, context.client.workspace_id);
  const displayName = context.contactName ?? context.client.preferred_name ?? context.client.first_name;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome{displayName ? `, ${displayName}` : ""}</h1>
        <p className="text-sm text-muted-foreground mt-1">Here&apos;s what needs your attention.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Open organizers" value={summary.organizers.filter((o) => o.status !== "approved").length} icon={ClipboardList} href="/portal/organizer" />
        <StatCard label="Document requests" value={summary.openRequests.length} icon={FileText} href="/portal/document-requests" tone={summary.openRequests.length > 0 ? "warning" : "default"} />
        <StatCard label="Upcoming appointments" value={summary.upcomingAppointments.length} icon={CalendarDays} href="/portal/appointments" />
        <StatCard label="Balance due" value={formatCurrency(summary.outstandingBalance)} icon={Receipt} href="/portal/invoices" tone={summary.outstandingBalance > 0 ? "warning" : "success"} />
        <StatCard label="Pending signatures" value={summary.pendingSignatures.length} icon={PenTool} href="/portal/signatures" tone={summary.pendingSignatures.length > 0 ? "warning" : "default"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Intake organizers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.organizers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No organizers assigned yet.</p>
            ) : (
              summary.organizers.map((o) => (
                <Link
                  key={o.id}
                  href={`/portal/organizer/${o.id}`}
                  className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm hover:bg-secondary/50"
                >
                  <div>
                    <p className="font-medium">{(o.template as { name?: string } | null)?.name ?? "Organizer"}</p>
                    <p className="text-xs text-muted-foreground">Due {formatDate(o.due_date)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{Math.round(Number(o.progress_percent ?? 0))}%</span>
                    <Badge variant="secondary">{intakeStatusLabel(o.status)}</Badge>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" /> Recent notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing new.</p>
            ) : (
              summary.notifications.map((n) => (
                <div key={n.id} className="rounded-md border border-border p-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className={n.is_read ? "text-muted-foreground" : "font-medium"}>{n.title}</p>
                    {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                  </div>
                  {n.message && <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(n.created_at)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {summary.upcomingAppointments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming appointments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.upcomingAppointments.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm">
                <div>
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(a.starts_at)}</p>
                </div>
                <Badge variant="secondary">{a.location_type}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
