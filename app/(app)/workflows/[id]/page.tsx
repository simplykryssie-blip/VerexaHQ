import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { WorkflowBuilder, type WorkflowStepRow, type WorkflowRunRow, type StaffOption, type AutomationOption } from "@/components/workflows/WorkflowBuilder";
import type { PipelineOption, LeadStageOption, TemplateOption } from "@/components/workflows/TriggerFields";
import type { Condition } from "@/components/workflows/ConditionsEditor";

export const dynamic = "force-dynamic";

export default async function WorkflowDetailPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const { data: automation } = await supabase
    .from("automations")
    .select("id, name, description, trigger_type, trigger_config, conditions, is_enabled, status")
    .eq("id", params.id)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!automation) notFound();

  const [
    { data: steps },
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
    { data: leadStagesRaw },
    { data: staffMembers },
    { data: otherAutomations },
    { data: serviceCategoriesRaw },
  ] = await Promise.all([
      supabase
        .from("automation_steps")
        .select("id, display_order, action_type, action_config, delay_minutes")
        .eq("automation_id", automation.id)
        .order("display_order"),
      supabase
        .from("automation_runs")
        .select("id, status, started_at, completed_at, engagements(engagement_number), clients(first_name, last_name, business_name)")
        .eq("automation_id", automation.id)
        .order("started_at", { ascending: false })
        .limit(20),
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
        .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
        .eq("status", "published")
        .order("name"),
      supabase
        .from("services")
        .select("id, name")
        .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
        .eq("status", "published")
        .order("name"),
      supabase
        .from("engagement_letter_templates")
        .select("id, name")
        .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
        .eq("status", "published")
        .order("name"),
      supabase
        .from("document_request_templates")
        .select("id, name")
        .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
        .eq("status", "published")
        .order("name"),
      supabase
        .from("processes")
        .select("id, name, process_stages(id, name, display_order)")
        .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
        .eq("status", "published")
        .order("name"),
      supabase.from("lead_stages").select("key, label").eq("workspace_id", workspace.id).order("display_order"),
      supabase
        .from("workspace_users")
        .select("user_id, user_profiles(id, display_name)")
        .eq("workspace_id", workspace.id)
        .eq("status", "active"),
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
        .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
        .order("name"),
    ]);

  const stepRows: WorkflowStepRow[] = (steps ?? []).map((s) => ({
    id: s.id,
    display_order: s.display_order,
    action_type: s.action_type,
    action_config: s.action_config as Record<string, unknown>,
    delay_minutes: s.delay_minutes,
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

  const leadStages: LeadStageOption[] = leadStagesRaw ?? [];

  const staffOptions: StaffOption[] = (staffMembers ?? [])
    .map((m) => m.user_profiles as unknown as { id: string; display_name: string | null } | null)
    .filter((p): p is { id: string; display_name: string | null } => Boolean(p));

  const automationOptions: AutomationOption[] = otherAutomations ?? [];

  const serviceCategories: TemplateOption[] = serviceCategoriesRaw ?? [];

  return (
    <>
      <PageHeader backHref="/workflows" backLabel="Back to Workflows" title={automation.name} description={automation.description ?? undefined} />
      <div className="flex-1 px-8 py-6">
        <WorkflowBuilder
          automationId={automation.id}
          triggerType={automation.trigger_type}
          triggerConfig={automation.trigger_config as Record<string, unknown>}
          isEnabled={automation.is_enabled}
          steps={stepRows}
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
          leadStages={leadStages}
          staffOptions={staffOptions}
          automationOptions={automationOptions}
          conditions={(automation.conditions as unknown as Condition[]) ?? []}
        />
      </div>
    </>
  );
}
