import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import {
  WorkflowBuilder,
  type WorkflowStepRow,
  type WorkflowStepEdgeRow,
  type WorkflowRunRow,
  type StaffOption,
  type AutomationOption,
  type RoleOption,
  type PendingApprovalRow,
} from "@/components/workflows/WorkflowBuilder";
import { WorkflowNameEditor } from "@/components/workflows/WorkflowNameEditor";
import type { PipelineOption, TemplateOption } from "@/components/workflows/TriggerFields";
import type { Condition, ConditionGroup } from "@/components/workflows/ConditionsEditor";
import { getWorkspaceStaff } from "@/lib/workspaceStaff";

export const dynamic = "force-dynamic";

export default async function WorkflowDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { activity?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const { data: automation } = await supabase
    .from("automations")
    .select("id, name, description, trigger_type, trigger_config, conditions, is_enabled, status, webhook_token")
    .eq("id", params.id)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!automation) notFound();

  const [
    { data: steps },
    { data: stepEdges },
    { data: runs },
    { data: logs },
    { data: emailTemplates },
    { data: smsTemplates },
    { data: canManage },
    { data: organizerTemplates },
    { data: services },
    { data: engagementLetterTemplates },
    { data: documentRequestTemplates },
    { data: processes },
    staffMembers,
    { data: otherAutomations },
    { data: serviceCategoriesRaw },
    { data: tagRows },
    { data: rolesRaw },
    { data: pendingApprovalsRaw },
  ] = await Promise.all([
      supabase
        .from("automation_steps")
        .select("id, display_order, action_type, action_config, delay_minutes, canvas_x, canvas_y, requires_approval, approver_role_id, display_name, is_enabled")
        .eq("automation_id", automation.id)
        .order("display_order"),
      supabase
        .from("automation_step_edges")
        .select("id, from_step_id, to_step_id, branch_conditions, label, sort_order")
        .eq("automation_id", automation.id)
        .order("sort_order"),
      supabase
        .from("automation_runs")
        .select("id, status, started_at, completed_at, current_step_id, is_test, engagements(engagement_number), clients(first_name, last_name, business_name)")
        .eq("automation_id", automation.id)
        .order("started_at", { ascending: false })
        .limit(50),
      supabase
        .from("automation_execution_logs")
        .select("id, status, executed_at, execution_data, error_message")
        .eq("automation_id", automation.id)
        .order("executed_at", { ascending: false })
        .limit(30),
      supabase
        .from("email_templates")
        .select("id, name, slug")
        .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
        .eq("status", "published")
        .order("name"),
      supabase
        .from("sms_templates")
        .select("id, name, slug")
        .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
        .eq("status", "published")
        .order("name"),
      supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "automations.manage" }),
      supabase
        .from("organizer_templates")
        .select("id, name")
        .eq("workspace_id", workspace.id)
        .eq("status", "published")
        .order("name"),
      supabase
        .from("services")
        .select("id, name")
        .eq("workspace_id", workspace.id)
        .eq("status", "published")
        .order("name"),
      supabase
        .from("engagement_letter_templates")
        .select("id, name")
        .eq("workspace_id", workspace.id)
        .eq("status", "published")
        .order("name"),
      supabase
        .from("document_request_templates")
        .select("id, name")
        .eq("workspace_id", workspace.id)
        .eq("status", "published")
        .order("name"),
      supabase
        .from("processes")
        .select("id, name, process_stages(id, name, display_order)")
        .eq("workspace_id", workspace.id)
        .eq("status", "published")
        .order("name"),
      getWorkspaceStaff(supabase, workspace.id),
      supabase
        .from("automations")
        .select("id, name")
        .eq("workspace_id", workspace.id)
        .eq("is_enabled", true)
        .eq("status", "published")
        .neq("id", automation.id)
        .order("name"),
      supabase
        .from("service_categories")
        .select("id, name")
        .eq("workspace_id", workspace.id)
        .order("name"),
      supabase.from("workspace_tags").select("name").eq("workspace_id", workspace.id).order("name"),
      supabase
        .from("roles")
        .select("id, name")
        .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
        .order("name"),
      supabase
        .from("automation_pending_steps")
        .select(
          "id, created_at, automation_steps(display_name, action_type), automation_runs!inner(automation_id, engagements(engagement_number), clients(first_name, last_name, business_name))"
        )
        .eq("status", "pending_approval")
        .eq("automation_runs.automation_id", automation.id)
        .order("created_at", { ascending: true }),
    ]);

  const stepRows: WorkflowStepRow[] = (steps ?? []).map((s) => ({
    id: s.id,
    display_order: s.display_order,
    action_type: s.action_type,
    action_config: s.action_config as Record<string, unknown>,
    delay_minutes: s.delay_minutes,
    canvas_x: s.canvas_x,
    canvas_y: s.canvas_y,
    requires_approval: s.requires_approval,
    approver_role_id: s.approver_role_id,
    display_name: s.display_name,
    is_enabled: s.is_enabled,
  }));

  const roleOptions: RoleOption[] = rolesRaw ?? [];

  const pendingApprovals: PendingApprovalRow[] = (pendingApprovalsRaw ?? []).map((p) => {
    const step = p.automation_steps as unknown as { display_name: string | null; action_type: string } | null;
    const run = p.automation_runs as unknown as {
      engagements: { engagement_number: string | null } | null;
      clients: { first_name: string | null; last_name: string | null; business_name: string | null } | null;
    } | null;
    const client = run?.clients;
    return {
      id: p.id,
      created_at: p.created_at,
      step_display_name: step?.display_name ?? null,
      action_type: step?.action_type ?? "step",
      engagement_number: run?.engagements?.engagement_number ?? null,
      client_name: client ? client.business_name || [client.first_name, client.last_name].filter(Boolean).join(" ") || null : null,
    };
  });

  const stepEdgeRows: WorkflowStepEdgeRow[] = (stepEdges ?? []).map((e) => ({
    id: e.id,
    from_step_id: e.from_step_id,
    to_step_id: e.to_step_id,
    branch_conditions: e.branch_conditions as unknown as Condition[] | ConditionGroup[] | null,
    label: e.label,
    sort_order: e.sort_order,
  }));

  function clientLabelFor(c: { first_name: string | null; last_name: string | null; business_name: string | null } | null) {
    if (!c) return null;
    return c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
  }

  const runRows: WorkflowRunRow[] = (runs ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    started_at: r.started_at,
    completed_at: r.completed_at,
    current_step_id: r.current_step_id,
    is_test: Boolean(r.is_test),
    engagement_number: (r.engagements as unknown as { engagement_number: string | null } | null)?.engagement_number ?? null,
    client_name: clientLabelFor(r.clients as unknown as { first_name: string | null; last_name: string | null; business_name: string | null } | null),
  }));

  const pipelines: PipelineOption[] = (processes ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    stages: (p.process_stages as unknown as { id: string; name: string; display_order: number }[])
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((s) => ({ id: s.id, name: s.name })),
  }));

  const staffOptions: StaffOption[] = staffMembers.map((m) => ({ id: m.user_id, display_name: m.display_name, is_owner: m.is_owner }));

  const automationOptions: AutomationOption[] = otherAutomations ?? [];

  const serviceCategories: TemplateOption[] = serviceCategoriesRaw ?? [];

  const tagOptions: string[] = (tagRows ?? []).map((t) => t.name);

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-border bg-surface px-8 py-6">
        <div>
          <Link href="/workflows" className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink">
            <ArrowLeft size={14} aria-hidden="true" /> Back to Workflows
          </Link>
          <WorkflowNameEditor automationId={automation.id} name={automation.name} canEdit={Boolean(canManage)} />
          {automation.description && <p className="mt-1 text-sm text-muted">{automation.description}</p>}
        </div>
      </div>
      <div className="flex-1 px-8 py-6">
        <WorkflowBuilder
          workspaceId={workspace.id}
          automationId={automation.id}
          triggerType={automation.trigger_type}
          triggerConfig={automation.trigger_config as Record<string, unknown>}
          isEnabled={automation.is_enabled}
          status={automation.status}
          steps={stepRows}
          stepEdges={stepEdgeRows}
          runs={runRows}
          logs={logs ?? []}
          emailTemplates={emailTemplates ?? []}
          smsTemplates={smsTemplates ?? []}
          canManage={Boolean(canManage)}
          organizerTemplates={organizerTemplates ?? []}
          engagementLetterTemplates={engagementLetterTemplates ?? []}
          documentRequestTemplates={documentRequestTemplates ?? []}
          services={services ?? []}
          serviceCategories={serviceCategories}
          pipelines={pipelines}
          staffOptions={staffOptions}
          automationOptions={automationOptions}
          tagOptions={tagOptions}
          roleOptions={roleOptions}
          pendingApprovals={pendingApprovals}
          conditions={(automation.conditions as unknown as Condition[] | ConditionGroup[]) ?? []}
          webhookToken={automation.webhook_token}
          initialActivityOpen={searchParams.activity === "1"}
        />
      </div>
    </>
  );
}
