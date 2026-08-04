import { createClient } from "@/lib/supabase/server";

export type KpiData = {
  revenueThisMonth: number;
  openEngagements: number;
  tasksDueToday: number;
  outstandingInvoicesTotal: number;
  outstandingInvoicesCount: number;
  missingDocumentsCount: number;
  openClientMessages: number;
};

export type OverdueTask = { id: string; title: string; due_date: string; engagement_id: string };
export type OverdueInvoice = { id: string; invoice_number: string | null; client_id: string; due_date: string; balance: number };
export type ReviewItem = { workflow_stage_id: string; stage_name: string; engagement_number: string | null; client_id: string; sla_category: string };
export type ActivityItem = { id: string; description: string; activity_type: string; created_at: string };
export type CalendarItem = { id: string; date: string; label: string; href?: string; kind: "engagement" | "task" };

export type DashboardData = {
  kpis: KpiData;
  overdueTasks: OverdueTask[];
  dueTodayTasks: OverdueTask[];
  overdueInvoices: OverdueInvoice[];
  reviewItems: ReviewItem[];
  recentActivity: ActivityItem[];
  calendarItems: CalendarItem[];
};

export async function getDashboardData(workspaceId: string): Promise<DashboardData> {
  const supabase = createClient();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [
    { data: payments },
    { data: openEngagements },
    { data: allTasks },
    { data: invoices },
    { data: openThreads },
    { data: activity },
    { data: workflowRuns },
  ] = await Promise.all([
    supabase
      .from("payments")
      .select("amount")
      .eq("workspace_id", workspaceId)
      .eq("status", "succeeded")
      .gte("payment_date", startOfMonth.toISOString()),
    supabase
      .from("engagements")
      .select("id, service_id")
      .eq("workspace_id", workspaceId)
      .not("status", "in", '("Completed","Archived")'),
    supabase
      .from("tasks")
      .select("id, title, due_date, engagement_id, status")
      .eq("workspace_id", workspaceId)
      .not("due_date", "is", null)
      .neq("status", "completed"),
    supabase
      .from("invoices")
      .select("id, invoice_number, client_id, due_date, total_amount, amount_paid, status")
      .eq("workspace_id", workspaceId)
      .not("status", "in", '("paid","void","draft")'),
    supabase.from("message_threads").select("id").eq("workspace_id", workspaceId).eq("status", "open"),
    supabase
      .from("activity_log")
      .select("id, description, activity_type, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("workflow_runs").select("id").eq("workspace_id", workspaceId),
  ]);

  const revenueThisMonth = (payments ?? []).reduce((sum, p) => sum + p.amount, 0);

  const tasks = allTasks ?? [];
  const overdueTasks = tasks.filter((t) => t.due_date && t.due_date < startOfToday.toISOString());
  const dueTodayTasks = tasks.filter(
    (t) => t.due_date && t.due_date >= startOfToday.toISOString() && t.due_date < endOfToday.toISOString()
  );

  const invoiceRows = invoices ?? [];
  const outstandingInvoicesTotal = invoiceRows.reduce((sum, i) => sum + (i.total_amount - i.amount_paid), 0);
  const overdueInvoices: OverdueInvoice[] = invoiceRows
    .filter((i) => i.due_date && i.due_date < startOfToday.toISOString())
    .map((i) => ({
      id: i.id,
      invoice_number: i.invoice_number,
      client_id: i.client_id,
      due_date: i.due_date as string,
      balance: i.total_amount - i.amount_paid,
    }));

  // Best-effort workspace-wide missing-document estimate, same approximation
  // documented on the Client Workspace: requested-via-service-template count
  // vs. uploaded attachment count, with no FK tying a specific attachment to
  // a specific requested item.
  const openEngagementIds = (openEngagements ?? []).map((e) => e.id);
  const serviceIds = Array.from(new Set((openEngagements ?? []).map((e) => e.service_id).filter((v): v is string => Boolean(v))));
  let missingDocumentsCount = 0;
  if (serviceIds.length > 0 && openEngagementIds.length > 0) {
    const { data: services } = await supabase
      .from("services")
      .select("id, document_request_template_id")
      .in("id", serviceIds)
      .not("document_request_template_id", "is", null);
    const templateIds = (services ?? []).map((s) => s.document_request_template_id).filter((v): v is string => Boolean(v));
    if (templateIds.length > 0) {
      const [{ count: requestedCount }, { count: uploadedCount }] = await Promise.all([
        supabase.from("document_request_items").select("id", { count: "exact", head: true }).in("document_request_template_id", templateIds),
        supabase
          .from("attachments")
          .select("id", { count: "exact", head: true })
          .eq("entity_type", "engagement")
          .in("entity_id", openEngagementIds),
      ]);
      missingDocumentsCount = Math.max((requestedCount ?? 0) - (uploadedCount ?? 0), 0);
    }
  }

  let reviewItems: ReviewItem[] = [];
  const runIds = (workflowRuns ?? []).map((r) => r.id);
  if (runIds.length > 0) {
    const { data: queue } = await supabase.from("v_reviewer_queue").select("*").in(
      "workflow_stage_id",
      (
        await supabase.from("workflow_stages").select("id").in("workflow_run_id", runIds)
      ).data?.map((s) => s.id) ?? []
    );
    if (queue && queue.length > 0) {
      const stageIds = queue.map((q) => q.workflow_stage_id);
      const { data: slaRows } = await supabase.from("v_workflow_sla_status").select("workflow_stage_id, sla_category").in("workflow_stage_id", stageIds);
      const slaByStage = new Map((slaRows ?? []).map((s) => [s.workflow_stage_id, s.sla_category as string]));
      reviewItems = queue
        .filter((q): q is typeof q & { workflow_stage_id: string; stage_name: string; client_id: string } =>
          Boolean(q.workflow_stage_id && q.stage_name && q.client_id)
        )
        .map((q) => ({
          workflow_stage_id: q.workflow_stage_id,
          stage_name: q.stage_name,
          engagement_number: q.engagement_number,
          client_id: q.client_id,
          sla_category: slaByStage.get(q.workflow_stage_id) ?? "On Track",
        }));
    }
  }

  const [{ data: calEngagements }, { data: calTasks }] = await Promise.all([
    supabase
      .from("engagements")
      .select("id, engagement_number, due_date")
      .eq("workspace_id", workspaceId)
      .not("due_date", "is", null)
      .order("due_date")
      .limit(20),
    supabase
      .from("tasks")
      .select("id, title, due_date")
      .eq("workspace_id", workspaceId)
      .not("due_date", "is", null)
      .neq("status", "completed")
      .order("due_date")
      .limit(20),
  ]);

  const calendarItems: CalendarItem[] = [
    ...(calEngagements ?? []).map((e) => ({
      id: e.id,
      date: e.due_date as string,
      label: e.engagement_number ?? "Engagement",
      href: `/engagements/${e.id}`,
      kind: "engagement" as const,
    })),
    ...(calTasks ?? []).map((t) => ({ id: t.id, date: t.due_date as string, label: t.title, kind: "task" as const })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    kpis: {
      revenueThisMonth,
      openEngagements: openEngagementIds.length,
      tasksDueToday: dueTodayTasks.length,
      outstandingInvoicesTotal,
      outstandingInvoicesCount: invoiceRows.length,
      missingDocumentsCount,
      openClientMessages: openThreads?.length ?? 0,
    },
    overdueTasks: overdueTasks as OverdueTask[],
    dueTodayTasks: dueTodayTasks as OverdueTask[],
    overdueInvoices,
    reviewItems,
    recentActivity: activity ?? [],
    calendarItems,
  };
}
