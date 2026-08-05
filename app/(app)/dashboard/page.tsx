import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getDashboardData } from "@/lib/dashboard/data";
import { computeTodaysPriorities } from "@/lib/dashboard/priorities";
import { DashboardShell } from "./DashboardShell";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: dashboardId } = await supabase.rpc("ensure_default_dashboard", { p_workspace_id: workspace.id });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: widgets }, data, { data: clientsCreate }, { data: engagementsManage }, { data: billingManage }, { data: documentsRequest }, { data: appointmentsManage }] =
    await Promise.all([
      dashboardId
        ? supabase
            .from("dashboard_widgets")
            .select("id, widget_type, title, display_order, is_visible")
            .eq("dashboard_id", dashboardId)
            .order("display_order")
        : Promise.resolve({ data: [] }),
      getDashboardData(workspace.id),
      supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "clients.create" }),
      supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "engagements.manage" }),
      supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "billing.manage" }),
      supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "documents.request" }),
      supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "appointments.manage" }),
    ]);

  const quickActionPermissions = {
    clientsCreate: Boolean(clientsCreate),
    engagementsManage: Boolean(engagementsManage),
    billingManage: Boolean(billingManage),
    documentsRequest: Boolean(documentsRequest),
    appointmentsManage: Boolean(appointmentsManage),
  };

  const widgetIds = (widgets ?? []).map((w) => w.id);
  const { data: preferences } =
    user && widgetIds.length > 0
      ? await supabase
          .from("user_widget_preferences")
          .select("dashboard_widget_id, is_visible, display_order")
          .eq("user_id", user.id)
          .in("dashboard_widget_id", widgetIds)
      : { data: [] as { dashboard_widget_id: string; is_visible: boolean | null; display_order: number | null }[] };
  const prefByWidget = new Map((preferences ?? []).map((p) => [p.dashboard_widget_id, p]));

  const mergedWidgets = (widgets ?? []).map((w) => {
    const pref = prefByWidget.get(w.id);
    return {
      ...w,
      is_visible: pref?.is_visible ?? w.is_visible,
      display_order: pref?.display_order ?? w.display_order,
    };
  });

  const priorities = computeTodaysPriorities(data);

  return (
    <DashboardShell
      workspaceName={workspace.name}
      isAdmin={workspace.is_owner}
      widgets={mergedWidgets}
      data={data}
      priorities={priorities}
      quickActionPermissions={quickActionPermissions}
    />
  );
}
