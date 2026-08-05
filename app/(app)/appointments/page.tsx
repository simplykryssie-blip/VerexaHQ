import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { AppointmentsManager } from "@/components/appointments/AppointmentsManager";
import { clientLabel } from "@/lib/documentEntityLabels";
import type { AppointmentRow, ClientOption, EngagementOption, StaffOption } from "@/components/appointments/types";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "appointments.view" }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "appointments.manage" }),
  ]);

  if (!canView) {
    return (
      <>
        <PageHeader title="Appointments" description="Schedule and track client and staff appointments." />
        <div className="flex-1 px-8 py-6">
          <EmptyState message="You don't have permission to view appointments." />
        </div>
      </>
    );
  }

  const [{ data: appointmentRows }, { data: clientRows }, { data: engagementRows }, { data: staffRows }] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, title, description, location, start_at, end_at, status, portal_visible, client_id, engagement_id, staff_id, clients(first_name, last_name, business_name, client_type), engagements(engagement_number)"
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
  const engagements: EngagementOption[] = (engagementRows ?? []).map((e: any) => ({
    id: e.id,
    client_id: e.client_id,
    label: e.engagement_number ?? "Engagement",
  }));
  const staff: StaffOption[] = (staffRows ?? []).map((s: any) => ({ id: s.user_id, label: s.user_profiles?.display_name ?? "Staff member" }));

  return (
    <>
      <PageHeader title="Appointments" description="Schedule and track client and staff appointments." />
      <div className="flex-1 px-8 py-6">
        <AppointmentsManager
          workspaceId={workspace.id}
          appointments={appointments}
          clients={clients}
          engagements={engagements}
          staff={staff}
          canManage={Boolean(canManage)}
        />
      </div>
    </>
  );
}
