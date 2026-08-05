import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { CalendarView, type CalendarItem } from "./CalendarView";
import { AppointmentsManager } from "@/components/appointments/AppointmentsManager";
import { clientLabel } from "@/lib/documentEntityLabels";
import type { AppointmentRow, ClientOption, EngagementOption, StaffOption } from "@/components/appointments/types";

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
          <EmptyState message="You don't have permission to view the calendar." />
        </div>
      </>
    );
  }

  const [{ data: engagements }, { data: tasks }, { data: appointmentRows }, { data: clientRows }, { data: engagementOptions }, { data: staffRows }] =
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
          "id, title, description, location, meeting_url, start_at, end_at, status, portal_visible, client_id, engagement_id, staff_id, clients(first_name, last_name, business_name, client_type), engagements(engagement_number)"
        )
        .eq("workspace_id", workspace.id)
        .order("start_at", { ascending: true })
        .limit(200),
      supabase
        .from("clients")
        .select("id, first_name, last_name, business_name, client_type")
        .eq("workspace_id", workspace.id)
        .is("merged_into_client_id", null),
      supabase.from("engagements").select("id, engagement_number, client_id").eq("workspace_id", workspace.id),
      supabase.from("workspace_users").select("user_id, user_profiles(id, display_name)").eq("workspace_id", workspace.id).eq("status", "active"),
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
    engagement_id: a.engagement_id,
    engagement_label: a.engagements ? `${a.engagements.engagement_number ?? "Engagement"}${a.clients ? ` -- ${clientLabel(a.clients)}` : ""}` : null,
    staff_id: a.staff_id,
    staff_name: null,
  }));

  const staffNameById = new Map(
    (staffRows ?? []).map((s: any) => [s.user_id, s.user_profiles?.display_name ?? "Staff member"])
  );
  for (const a of appointments) {
    if (a.staff_id) a.staff_name = staffNameById.get(a.staff_id) ?? null;
  }

  const clients: ClientOption[] = (clientRows ?? []).map((c: any) => ({ id: c.id, label: clientLabel(c) }));
  const engagementOpts: EngagementOption[] = (engagementOptions ?? []).map((e) => ({
    id: e.id,
    client_id: e.client_id,
    label: e.engagement_number ?? "Engagement",
  }));
  const staff: StaffOption[] = (staffRows ?? []).map((s: any) => ({ id: s.user_id, label: s.user_profiles?.display_name ?? "Staff member" }));

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
      <div className="flex-1 space-y-6 px-8 py-6">
        <CalendarView items={items} />
        <AppointmentsManager
          workspaceId={workspace.id}
          appointments={appointments}
          clients={clients}
          engagements={engagementOpts}
          staff={staff}
          canManage={Boolean(canManage)}
          currentUserId={user?.id ?? null}
        />
      </div>
    </>
  );
}
