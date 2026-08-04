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

  const [{ data: widgets }, data] = await Promise.all([
    dashboardId
      ? supabase
          .from("dashboard_widgets")
          .select("id, widget_type, title, display_order, is_visible")
          .eq("dashboard_id", dashboardId)
          .order("display_order")
      : Promise.resolve({ data: [] }),
    getDashboardData(workspace.id),
  ]);

  const priorities = computeTodaysPriorities(data);

  return (
    <DashboardShell
      workspaceName={workspace.name}
      isAdmin={workspace.is_owner}
      widgets={widgets ?? []}
      data={data}
      priorities={priorities}
    />
  );
}
