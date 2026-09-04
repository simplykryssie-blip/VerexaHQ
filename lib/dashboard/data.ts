import { createClient } from "@/lib/supabase/server";
import { buildEntityLabelMap } from "@/lib/documentEntityLabels";

export type KpiData = {
  revenueThisMonth: number;
  revenueLastMonth: number;
  openEngagements: number;
  tasksDueToday: number;
  tasksDueYesterday: number;
  outstandingInvoicesTotal: number;
  outstandingInvoicesCount: number;
  missingDocumentsCount: number;
  openClientMessages: number;
};

export type OverdueTask = {
  id: string;
  title: string;
  due_date: string;
  engagement_id: string | null;
  client_id: string | null;
  related_organizer_response_id: string | null;
};
export type OverdueInvoice = { id: string; invoice_number: string | null; client_id: string; due_date: string; balance: number };
export type ReviewItem = {
  workflow_stage_id: string;
  stage_name: string;
  engagement_number: string | null;
  client_id: string;
  client_name: string;
  service_name: string | null;
  sla_category: string;
  started_at: string | null;
};
export type ActivityItem = { id: string; description: string; activity_type: string; created_at: string };
export type CalendarItem = { id: string; date: string; label: string; href?: string; kind: "engagement" | "task" };
export type ServiceEngagementCount = { serviceId: string; name: string; count: number };
export type PipelineStageCount = { status: string; count: number };
export type DeadlineRiskItem = {
  id: string;
  engagement_number: string | null;
  client_id: string;
  client_name: string;
  due_date: string;
  status: string;
  daysRemaining: number;
};
export type UnassignedEngagementItem = {
  id: string;
  engagement_number: string | null;
  client_id: string;
  client_name: string;
  status: string;
  due_date: string | null;
};
export type OverdueRequestItem = {
  id: string;
  title: string;
  due_date: string;
  entityLabel: string;
  entityHref: string;
};
export type FailedAutomationRunItem = {
  id: string;
  automation_id: string;
  automation_name: string;
  completed_at: string | null;
  error_message: string | null;
};

// How close to its due date an engagement has to be (or how far past it)
// before it counts as at risk -- generous enough to be useful without
// flagging half the pipeline every day.
const DEADLINE_RISK_WINDOW_DAYS = 7;

// Mirrors engagements_status_check exactly, minus Archived -- a pipeline
// strip has no use for a terminal "put away" bucket the way Completed still
// is one. This is real engagements.status data, not the newer generic
// pipeline_runs/processes system (which today only has entity_type='client'
// lead-pipeline rows -- nothing for engagements yet).
export const ENGAGEMENT_PIPELINE_STATUSES = [
  "New",
  "Waiting On Client",
  "Waiting On Staff",
  "In Progress",
  "Waiting On Review",
  "Corrections Requested",
  "Approved",
  "Waiting On Signature",
  "Waiting On Payment",
  "Ready To Release",
  "Completed",
] as const;

export type DashboardData = {
  kpis: KpiData;
  overdueTasks: OverdueTask[];
  dueTodayTasks: OverdueTask[];
  overdueInvoices: OverdueInvoice[];
  reviewItems: ReviewItem[];
  recentActivity: ActivityItem[];
  calendarItems: CalendarItem[];
  topServices: ServiceEngagementCount[];
  engagementPipeline: PipelineStageCount[];
  deadlineRisk: DeadlineRiskItem[];
  unassignedEngagements: UnassignedEngagementItem[];
  overdueRequests: OverdueRequestItem[];
  failedAutomationRuns: FailedAutomationRunItem[];
};

export async function getDashboardData(workspaceId: string): Promise<DashboardData> {
  const supabase = createClient();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startOfLastMonth = new Date(startOfMonth);
  startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const [
    { data: payments },
    { data: lastMonthPayments },
    { data: openEngagements },
    { data: allTasks },
    { count: tasksDueYesterdayCount },
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
    // Same-shape query for last calendar month, so "Revenue This Month" can
    // show a real vs-last-month trend rather than a static number alone.
    supabase
      .from("payments")
      .select("amount")
      .eq("workspace_id", workspaceId)
      .eq("status", "succeeded")
      .gte("payment_date", startOfLastMonth.toISOString())
      .lt("payment_date", startOfMonth.toISOString()),
    supabase
      .from("engagements")
      .select("id, service_id")
      .eq("workspace_id", workspaceId)
      .not("status", "in", '("Completed","Archived")'),
    supabase
      .from("tasks")
      .select("id, title, due_date, engagement_id, client_id, related_organizer_response_id, status")
      .eq("workspace_id", workspaceId)
      .not("due_date", "is", null)
      .neq("status", "completed"),
    // Same "still outstanding" definition as today's due-today count, just
    // for yesterday's date bucket -- real comparison, not a fabricated trend.
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .neq("status", "completed")
      .gte("due_date", startOfYesterday.toISOString())
      .lt("due_date", startOfToday.toISOString()),
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
    supabase.from("pipeline_runs").select("id").eq("workspace_id", workspaceId).eq("entity_type", "engagement"),
  ]);

  const revenueThisMonth = (payments ?? []).reduce((sum, p) => sum + p.amount, 0);
  const revenueLastMonth = (lastMonthPayments ?? []).reduce((sum, p) => sum + p.amount, 0);

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

  const openEngagementIds = (openEngagements ?? []).map((e) => e.id);
  const serviceIds = Array.from(new Set((openEngagements ?? []).map((e) => e.service_id).filter((v): v is string => Boolean(v))));

  const [{ data: serviceNameRows }, { data: allEngagementStatuses }] = await Promise.all([
    serviceIds.length ? supabase.from("services").select("id, name").in("id", serviceIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase.from("engagements").select("status").eq("workspace_id", workspaceId).neq("status", "Archived"),
  ]);

  const serviceNameById = new Map((serviceNameRows ?? []).map((s) => [s.id, s.name]));
  const engagementCountByService = new Map<string, number>();
  for (const e of openEngagements ?? []) {
    if (!e.service_id) continue;
    engagementCountByService.set(e.service_id, (engagementCountByService.get(e.service_id) ?? 0) + 1);
  }
  const topServices: ServiceEngagementCount[] = Array.from(engagementCountByService.entries())
    .map(([serviceId, count]) => ({ serviceId, name: serviceNameById.get(serviceId) ?? "Other", count }))
    .sort((a, b) => b.count - a.count);

  const statusCounts = new Map<string, number>();
  for (const row of allEngagementStatuses ?? []) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  }
  const engagementPipeline: PipelineStageCount[] = ENGAGEMENT_PIPELINE_STATUSES.map((status) => ({
    status,
    count: statusCounts.get(status) ?? 0,
  }));

  // Real per-item fulfillment status on open document requests -- not an
  // estimate. document_requests/document_request_item_statuses is the same
  // table pair the Documents report and portal already use; this used to
  // instead compare a service's document-request *template* item count
  // against a raw attachment count, which only ever reflected a service's
  // catalog definition, not any actual request sent to a specific client or
  // engagement (so a real ad-hoc or organizer-driven request, with no
  // service template involved at all, never showed up here).
  const { count: missingDocumentsCount } = await supabase
    .from("document_request_item_statuses")
    .select("id, document_requests!inner(workspace_id, status)", { count: "exact", head: true })
    .eq("document_requests.workspace_id", workspaceId)
    .eq("document_requests.status", "open")
    .eq("status", "pending")
    .eq("is_required", true);

  let reviewItems: ReviewItem[] = [];
  const runIds = (workflowRuns ?? []).map((r) => r.id);
  if (runIds.length > 0) {
    const { data: queue } = await supabase.from("v_reviewer_queue").select("*").in(
      "workflow_stage_id",
      (
        await supabase.from("pipeline_stages").select("id").in("pipeline_run_id", runIds)
      ).data?.map((s) => s.id) ?? []
    );
    if (queue && queue.length > 0) {
      const stageIds = queue.map((q) => q.workflow_stage_id);
      const clientIds = Array.from(new Set(queue.map((q) => q.client_id).filter((v): v is string => Boolean(v))));
      const engagementIds = Array.from(new Set(queue.map((q) => q.engagement_id).filter((v): v is string => Boolean(v))));
      const [{ data: slaRows }, { data: clientRows }, { data: engagementRows }] = await Promise.all([
        supabase.from("v_workflow_sla_status").select("workflow_stage_id, sla_category").in("workflow_stage_id", stageIds),
        clientIds.length
          ? supabase.from("clients").select("id, client_type, first_name, last_name, business_name").in("id", clientIds)
          : Promise.resolve({ data: [] }),
        engagementIds.length ? supabase.from("engagements").select("id, service_id").in("id", engagementIds) : Promise.resolve({ data: [] }),
      ]);
      const serviceIds = Array.from(new Set((engagementRows ?? []).map((e) => e.service_id).filter((v): v is string => Boolean(v))));
      const { data: serviceRows } = serviceIds.length
        ? await supabase.from("services").select("id, name").in("id", serviceIds)
        : { data: [] as { id: string; name: string }[] };

      const slaByStage = new Map((slaRows ?? []).map((s) => [s.workflow_stage_id, s.sla_category as string]));
      const clientById = new Map((clientRows ?? []).map((c) => [c.id, c]));
      const serviceIdByEngagement = new Map((engagementRows ?? []).map((e) => [e.id, e.service_id]));
      const serviceNameById = new Map((serviceRows ?? []).map((s) => [s.id, s.name]));

      reviewItems = queue
        .filter((q): q is typeof q & { workflow_stage_id: string; stage_name: string; client_id: string } =>
          Boolean(q.workflow_stage_id && q.stage_name && q.client_id)
        )
        .map((q) => {
          const client = clientById.get(q.client_id);
          const clientName = client
            ? client.client_type === "business" && client.business_name
              ? client.business_name
              : [client.first_name, client.last_name].filter(Boolean).join(" ") || "Unnamed client"
            : "Unknown client";
          const serviceId = q.engagement_id ? serviceIdByEngagement.get(q.engagement_id) : null;
          return {
            workflow_stage_id: q.workflow_stage_id,
            stage_name: q.stage_name,
            engagement_number: q.engagement_number,
            client_id: q.client_id,
            client_name: clientName,
            service_name: serviceId ? (serviceNameById.get(serviceId) ?? null) : null,
            sla_category: slaByStage.get(q.workflow_stage_id) ?? "On Track",
            started_at: q.started_at,
          };
        });
    }
  }

  // v_reviewer_queue only covers engagement-level pipeline stages -- a lead
  // who submits their intake organizer before an engagement exists (the
  // normal path: New Tax Service Lead Enters CRM sends the organizer, then
  // waits for it back, before any engagement is created) was invisible here
  // even though it's exactly the kind of thing this widget exists for.
  const { data: submittedOrganizers } = await supabase
    .from("organizer_responses")
    .select(
      "id, client_id, submitted_at, organizer_templates(name), resolved_service_id, services(name), clients(client_type, first_name, last_name, business_name)"
    )
    .eq("workspace_id", workspaceId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false });

  for (const o of submittedOrganizers ?? []) {
    const client = o.clients as unknown as { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null } | null;
    const clientName = client
      ? client.client_type === "business" && client.business_name
        ? client.business_name
        : [client.first_name, client.last_name].filter(Boolean).join(" ") || "Unnamed client"
      : "Unknown client";
    reviewItems.push({
      workflow_stage_id: `organizer:${o.id}`,
      stage_name: "Organizer Submitted",
      engagement_number: null,
      client_id: o.client_id,
      client_name: clientName,
      service_name: (o.services as unknown as { name: string } | null)?.name ?? (o.organizer_templates as unknown as { name: string } | null)?.name ?? null,
      sla_category: "On Track",
      started_at: o.submitted_at,
    });
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

  // Deadline risk: still-open engagements whose due date has already passed
  // or falls within the window -- real dates already on the record, not a
  // predicted/AI-scored risk. Ordered soonest-due (most overdue) first.
  const riskWindowEnd = new Date(startOfToday);
  riskWindowEnd.setDate(riskWindowEnd.getDate() + DEADLINE_RISK_WINDOW_DAYS);

  const { data: riskEngagements } = await supabase
    .from("engagements")
    .select("id, engagement_number, client_id, due_date, status")
    .eq("workspace_id", workspaceId)
    .not("due_date", "is", null)
    .not("status", "in", '("Completed","Archived")')
    .lte("due_date", riskWindowEnd.toISOString())
    .order("due_date")
    .limit(8);

  const riskClientIds = Array.from(new Set((riskEngagements ?? []).map((e) => e.client_id).filter((v): v is string => Boolean(v))));
  const { data: riskClientRows } = riskClientIds.length
    ? await supabase.from("clients").select("id, client_type, first_name, last_name, business_name").in("id", riskClientIds)
    : { data: [] as { id: string; client_type: string; first_name: string | null; last_name: string | null; business_name: string | null }[] };
  const riskClientById = new Map((riskClientRows ?? []).map((c) => [c.id, c]));

  const deadlineRisk: DeadlineRiskItem[] = (riskEngagements ?? [])
    .filter((e): e is typeof e & { client_id: string; due_date: string } => Boolean(e.client_id && e.due_date))
    .map((e) => {
      const client = riskClientById.get(e.client_id);
      const clientName = client
        ? client.client_type === "business" && client.business_name
          ? client.business_name
          : [client.first_name, client.last_name].filter(Boolean).join(" ") || "Unnamed client"
        : "Unknown client";
      return {
        id: e.id,
        engagement_number: e.engagement_number,
        client_id: e.client_id,
        client_name: clientName,
        due_date: e.due_date,
        status: e.status,
        daysRemaining: Math.round((new Date(e.due_date).getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000)),
      };
    });

  // Unassigned engagements: open work nobody owns yet -- the same "still
  // open" status filter as the deadline-risk query above, just without the
  // due-date requirement, since an engagement with no due date can still
  // sit unassigned indefinitely.
  const { data: unassignedRows } = await supabase
    .from("engagements")
    .select("id, engagement_number, client_id, status, due_date")
    .eq("workspace_id", workspaceId)
    .is("assigned_staff_id", null)
    .not("status", "in", '("Completed","Archived")')
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(8);

  const unassignedClientIds = Array.from(new Set((unassignedRows ?? []).map((e) => e.client_id).filter((v): v is string => Boolean(v))));
  const { data: unassignedClientRows } = unassignedClientIds.length
    ? await supabase.from("clients").select("id, client_type, first_name, last_name, business_name").in("id", unassignedClientIds)
    : { data: [] as { id: string; client_type: string; first_name: string | null; last_name: string | null; business_name: string | null }[] };
  const unassignedClientById = new Map((unassignedClientRows ?? []).map((c) => [c.id, c]));

  const unassignedEngagements: UnassignedEngagementItem[] = (unassignedRows ?? [])
    .filter((e): e is typeof e & { client_id: string } => Boolean(e.client_id))
    .map((e) => {
      const client = unassignedClientById.get(e.client_id);
      const clientName = client
        ? client.client_type === "business" && client.business_name
          ? client.business_name
          : [client.first_name, client.last_name].filter(Boolean).join(" ") || "Unnamed client"
        : "Unknown client";
      return {
        id: e.id,
        engagement_number: e.engagement_number,
        client_id: e.client_id,
        client_name: clientName,
        status: e.status,
        due_date: e.due_date,
      };
    });

  // Overdue client requests: open document requests whose due date has
  // already passed -- same open-request source as the Missing Documents
  // KPI, just filtered to the overdue subset and resolved to a real
  // client/engagement link via the same label map the Documents report uses.
  const { data: overdueRequestRows } = await supabase
    .from("document_requests")
    .select("id, title, due_date, entity_type, entity_id")
    .eq("workspace_id", workspaceId)
    .eq("status", "open")
    .not("due_date", "is", null)
    .lt("due_date", startOfToday.toISOString())
    .order("due_date", { ascending: true })
    .limit(8);

  const overdueRequestLabelMap = await buildEntityLabelMap(supabase, overdueRequestRows ?? []);
  const overdueRequests: OverdueRequestItem[] = (overdueRequestRows ?? []).map((r) => {
    const entity = overdueRequestLabelMap.get(`${r.entity_type}:${r.entity_id}`);
    return {
      id: r.id,
      title: r.title,
      due_date: r.due_date as string,
      entityLabel: entity?.label ?? "Unknown",
      entityHref: entity?.href ?? "/documents",
    };
  });

  // Failed automation runs: automation_runs.status = 'failed' is the
  // authoritative run-level outcome every automation action sets on
  // failure -- the per-step error text lives on automation_execution_logs
  // (workflow_run_id -> automation_runs.id), so a second query pulls the
  // most recent one per failed run for a real error preview, not a guess.
  const { data: failedRunRows } = await supabase
    .from("automation_runs")
    .select("id, automation_id, completed_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "failed")
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(8);

  const failedRunIds = (failedRunRows ?? []).map((r) => r.id);
  const failedAutomationIds = Array.from(new Set((failedRunRows ?? []).map((r) => r.automation_id).filter((v): v is string => Boolean(v))));
  const [{ data: failedAutomationNameRows }, { data: failedLogRows }] = await Promise.all([
    failedAutomationIds.length
      ? supabase.from("automations").select("id, name").in("id", failedAutomationIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    failedRunIds.length
      ? supabase
          .from("automation_execution_logs")
          .select("workflow_run_id, error_message, executed_at")
          .in("workflow_run_id", failedRunIds)
          .eq("status", "failed")
          .order("executed_at", { ascending: false })
      : Promise.resolve({ data: [] as { workflow_run_id: string | null; error_message: string | null; executed_at: string }[] }),
  ]);
  const automationNameById = new Map((failedAutomationNameRows ?? []).map((a) => [a.id, a.name]));
  const latestErrorByRun = new Map<string, string | null>();
  for (const log of failedLogRows ?? []) {
    if (log.workflow_run_id && !latestErrorByRun.has(log.workflow_run_id)) {
      latestErrorByRun.set(log.workflow_run_id, log.error_message);
    }
  }

  const failedAutomationRuns: FailedAutomationRunItem[] = (failedRunRows ?? [])
    .filter((r): r is typeof r & { automation_id: string } => Boolean(r.automation_id))
    .map((r) => ({
      id: r.id,
      automation_id: r.automation_id,
      automation_name: automationNameById.get(r.automation_id) ?? "Automation",
      completed_at: r.completed_at,
      error_message: latestErrorByRun.get(r.id) ?? null,
    }));

  return {
    kpis: {
      revenueThisMonth,
      revenueLastMonth,
      openEngagements: openEngagementIds.length,
      tasksDueToday: dueTodayTasks.length,
      tasksDueYesterday: tasksDueYesterdayCount ?? 0,
      outstandingInvoicesTotal,
      outstandingInvoicesCount: invoiceRows.length,
      missingDocumentsCount: missingDocumentsCount ?? 0,
      openClientMessages: openThreads?.length ?? 0,
    },
    overdueTasks: overdueTasks as OverdueTask[],
    dueTodayTasks: dueTodayTasks as OverdueTask[],
    overdueInvoices,
    reviewItems,
    recentActivity: activity ?? [],
    calendarItems,
    topServices,
    engagementPipeline,
    deadlineRisk,
    unassignedEngagements,
    overdueRequests,
    failedAutomationRuns,
  };
}
