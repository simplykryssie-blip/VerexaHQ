import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getPortalContext } from "@/lib/auth/portal";
import { getPortalAppointments } from "@/features/portal/queries";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ZoomStatus } from "@/features/appointments/appointment-actions";
import { appointmentStatusLabel, appointmentLocationLabel } from "@/lib/validation/appointments";
import { formatDateTime } from "@/lib/formatters";

export default async function PortalAppointmentsPage() {
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  const appointments = await getPortalAppointments(context.client.id);
  const now = Date.now();
  const upcoming = appointments.filter((a) => new Date(a.starts_at).getTime() >= now && a.status !== "cancelled");
  const past = appointments.filter((a) => new Date(a.starts_at).getTime() < now || a.status === "cancelled");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Appointments</h1>
        <p className="text-sm text-muted-foreground mt-1">Your scheduled meetings with your tax office.</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Upcoming</h2>
        {upcoming.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No upcoming appointments" description="Your tax office will schedule one when needed." />
        ) : (
          upcoming.map((a) => <AppointmentCard key={a.id} appointment={a} />)
        )}
      </div>

      {past.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Past</h2>
          {past.map((a) => (
            <AppointmentCard key={a.id} appointment={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AppointmentCard({
  appointment: a,
}: {
  appointment: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    starts_at: string;
    ends_at: string;
    location_type: string;
    location_text: string | null;
    client_notes: string | null;
    appointment_type: { name?: string } | null;
    zoom_meeting: { join_url?: string | null } | null;
  };
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-1.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="font-medium">{a.title}</p>
          <Badge variant={a.status === "cancelled" ? "destructive" : a.status === "completed" ? "success" : "secondary"}>{appointmentStatusLabel(a.status)}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{formatDateTime(a.starts_at)}</p>
        <p className="text-xs text-muted-foreground">
          {appointmentLocationLabel(a.location_type)}
          {a.location_text ? ` · ${a.location_text}` : ""}
          {a.appointment_type?.name ? ` · ${a.appointment_type.name}` : ""}
        </p>
        {a.location_type === "video" && <ZoomStatus joinUrl={a.zoom_meeting?.join_url} />}
        {a.description && <p className="text-sm mt-1">{a.description}</p>}
      </CardContent>
    </Card>
  );
}
