import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getDashboardData(workspaceId: string) {
  const supabase = await createClient();

  const [summary, workQueue, staffWorkload, missingDocs, revenue] = await Promise.all([
    supabase.from("v_tax_office_dashboard").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    supabase
      .from("v_engagement_work_queue")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(8),
    supabase.from("v_staff_workload").select("*").eq("workspace_id", workspaceId),
    supabase
      .from("v_missing_document_aging")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("age_days", { ascending: false })
      .limit(8),
    supabase
      .from("v_revenue_summary")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("period", { ascending: false })
      .limit(6),
  ]);

  return {
    summary: summary.data,
    workQueue: workQueue.data ?? [],
    staffWorkload: staffWorkload.data ?? [],
    missingDocs: missingDocs.data ?? [],
    revenue: revenue.data ?? [],
    errors: {
      summary: summary.error?.message ?? null,
      workQueue: workQueue.error?.message ?? null,
      staffWorkload: staffWorkload.error?.message ?? null,
      missingDocs: missingDocs.error?.message ?? null,
      revenue: revenue.error?.message ?? null,
    },
  };
}
