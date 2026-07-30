import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppointmentStatusSelect, ZoomStatus } from "@/features/appointments/appointment-actions";
import { appointmentLocationLabel } from "@/lib/validation/appointments";
import { formatDateTime } from "@/lib/formatters";

export default async function AppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: appointment } = await supabase
    .from("appointments")
    .select(
      "*, client:clients(id, first_name, last_name, company), lead:leads(id, first_name, last_name), engagement:tax_engagements(id, engagement_number, title), appointment_type:appointment_types(id, name), zoom_meeting:zoom_meetings(id, join_url, status)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!appointment) notFound();

  const { data: assigned } = appointment.assigned_user_id
    ? await supabase.from("user_profiles").select("display_name, first_name, last_name").eq("user_id", appointment.assigned_user_id).maybeSingle()
    : { data: null };

  const client = appointment.client as { id: string; first_name?: string; last_name?: string; company?: string } | null;
  const lead = appointment.lead as { first_name?: string; last_name?: string } | null;
  const engagement = appointment.engagement as { id: string; engagement_number?: string; title?: string } | null;
  const appointmentType = appointment.appointment_type as { name?: string } | null;
  const zoomMeeting = appointment.zoom_meeting as { join_url?: string | null } | null;

  return (
    <div className="space-y-4 max-w-2xl">
      <Link href="/calendar" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to calendar
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{appointment.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDateTime(appointment.starts_at)} – {formatDateTime(appointment.ends_at)}
          </p>
        </div>
        <AppointmentStatusSelect appointmentId={appointment.id} status={appointment.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Field label="Client">
            {client ? (
              <Link href={`/clients/${client.id}`} className="hover:underline">
                {client.company || `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim()}
              </Link>
            ) : lead ? (
              `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim()
            ) : (
              "—"
            )}
          </Field>
          <Field label="Engagement">
            {engagement ? (
              <Link href={`/engagements/${engagement.id}`} className="hover:underline">
                {engagement.engagement_number ?? engagement.title}
              </Link>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Type">{appointmentType?.name ?? "—"}</Field>
          <Field label="Assigned staff">{assigned?.display_name || [assigned?.first_name, assigned?.last_name].filter(Boolean).join(" ") || "—"}</Field>
          <Field label="Location">
            {appointmentLocationLabel(appointment.location_type)}
            {appointment.location_text && ` — ${appointment.location_text}`}
          </Field>
          <Field label="Meeting link">{appointment.location_type === "video" ? <ZoomStatus joinUrl={zoomMeeting?.join_url} /> : "—"}</Field>
          {appointment.client_notes && <Field label="Client-visible notes">{appointment.client_notes}</Field>}
          {appointment.internal_notes && <Field label="Internal notes">{appointment.internal_notes}</Field>}
        </CardContent>
      </Card>

      <Badge variant="outline">Created {formatDateTime(appointment.created_at)}</Badge>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}
