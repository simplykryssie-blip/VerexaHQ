import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import type { CalendarItem } from "./CalendarView";
import { CalendarPageClient } from "./CalendarPageClient";
import { clientLabel } from "@/lib/documentEntityLabels";
import { getWorkspaceStaff } from "@/lib/workspaceStaff";
import type { AppointmentRow, ClientOption, EngagementOption, StaffOption, ServiceOption } from "@/components/appointments/types";

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "appointments.view" }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "appointments.manage" }),
  ]);

  if (!canView) {
    return (
      <>
        <PageHeader title="Calendar" description="Engagement and task due dates, and appointments, across your workspace." />
        <div className="flex-1 px-8 py-6">
          <EmptyState icon={Lock} message="You don't have permission to view the calendar." />
        </div>
      </>
    );
  }

  const [{ data: engagements }, { data: tasks }, { data: appointmentRows }, { data: clientRows }, { data: engagementOptions }, staffRows, { data: timeOffRows }, { data: serviceRows }] =
    await Promise.all([
      supabase
        .from("engagements")
        .select("id, engagement_number, due_date")
        .eq("workspace_id", workspace.id)
        .not("due_date", "is", null),
      supabase
        .from("tasks")
        .select("id, title, due_date")
        .eq("workspace_id", workspace.id)
        .not("due_date", "is", null)
        .neq("status", "completed"),
      supabase
        .from("appointments")
        .select(
          "id, title, description, location, meeting_url, start_at, end_at, status, portal_visible, client_id, engagement_id, staff_id, clients(first_name, last_name, business_name, client_type, primary_email), engagements(engagement_number)"
        )
        .eq("workspace_id", workspace.id)
        .order("start_at", { ascending: true })
        .limit(200),
      supabase
        .from("clients")
        .select("id, first_name, last_name, business_name, client_type, primary_email")
        .eq("workspace_id", workspace.id)
        .is("merged_into_client_id", null),
      supabase.from("engagements").select("id, engagement_number, client_id").eq("workspace_id", workspace.id),
      getWorkspaceStaff(supabase, workspace.id),
      supabase
        .from("staff_time_off")
        .select("user_id, start_date, end_date")
        .eq("workspace_id", workspace.id)
        .gte("end_date", new Date().toISOString().slice(0, 10)),
      supabase
        .from("services")
        .select("id, name, estimated_duration_minutes, booking_location_type, booking_meeting_url, allow_overlapping_bookings")
        .eq("workspace_id", workspace.id)
        .eq("status", "published")
        .order("name"),
    ]);

  const appointments: AppointmentRow[] = (appointmentRows ?? []).map((a: any) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    location: a.location,
    meeting_url: a.meeting_url,
    start_at: a.start_at,
    end_at: a.end_at,
    status: a.status,
    portal_visible: a.portal_visible,
    client_id: a.client_id,
    client_label: a.clients ? clientLabel(a.clients) : null,
    client_email: a.clients?.primary_email ?? null,
    engagement_id: a.engagement_id,
    engagement_label: a.engagements ? `${a.engagements.engagement_number ?? "Engagement"}${a.clients ? ` -- ${clientLabel(a.clients)}` : ""}` : null,
    staff_id: a.staff_id,
    staff_name: null,
  }));

  const staffNameById = new Map(staffRows.map((s) => [s.user_id, s.display_name ?? "Staff member"]));
  for (const a of appointments) {
    if (a.staff_id) a.staff_name = staffNameById.get(a.staff_id) ?? null;
  }

  const clients: ClientOption[] = (clientRows ?? []).map((c: any) => ({ id: c.id, label: clientLabel(c), email: c.primary_email ?? null }));
  const engagementOpts: EngagementOption[] = (engagementOptions ?? []).map((e) => ({
    id: e.id,
    client_id: e.client_id,
    label: e.engagement_number ?? "Engagement",
  }));
  const staff: StaffOption[] = staffRows.map((s) => ({ id: s.user_id, label: s.display_name ?? "Staff member" }));
  const services: ServiceOption[] = serviceRows ?? [];

  const items: CalendarItem[] = [
    ...(engagements ?? []).map((e) => ({
      id: e.id,
      date: e.due_date as string,
      label: e.engagement_number ?? "Engagement",
      href: `/engagements/${e.id}`,
      kind: "engagement" as const,
    })),
    ...(tasks ?? []).map((t) => ({
      id: t.id,
      date: t.due_date as string,
      label: t.title,
      href: undefined,
      kind: "task" as const,
    })),
    ...appointments
      .filter((a) => a.status !== "cancelled")
      .map((a) => ({
        id: a.id,
        date: a.start_at,
        label: a.title,
        href: undefined,
        kind: "appointment" as const,
      })),
  ];

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Engagement and task due dates, and appointments, in one place."
      />
      <div className="flex-1 px-8 py-6">
        <CalendarPageClient
          workspaceId={workspace.id}
          items={items}
          appointments={appointments}
          clients={clients}
          engagements={engagementOpts}
          staff={staff}
          services={services}
          staffTimeOff={timeOffRows ?? []}
          canManage={Boolean(canManage)}
          currentUserId={user?.id ?? null}
        />
      </div>
    </>
  );
}
