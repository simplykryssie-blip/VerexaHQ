import { createClient } from "@/lib/supabase/server";

export async function getWorkflowDefinitions(workspaceId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workflow_definitions")
    .select("*, template:templates(id, name, status)")
    .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getWorkflowDefinitionDetail(id: string) {
  const supabase = await createClient();
  const [{ data: definition }, { data: nodes }, { data: connections }] = await Promise.all([
    supabase.from("workflow_definitions").select("*, template:templates(id, name, status)").eq("id", id).maybeSingle(),
    supabase.from("workflow_nodes").select("*").eq("workflow_definition_id", id).order("created_at"),
    supabase.from("workflow_connections").select("*").eq("workflow_definition_id", id).order("created_at"),
  ]);
  return { definition, nodes: nodes ?? [], connections: connections ?? [] };
}

export async function getWorkflowRuns(workspaceId: string, opts?: { status?: string; definitionId?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("workflow_runs")
    .select("*, definition:workflow_definitions(id, name), client:clients(id, first_name, last_name, company), engagement:tax_engagements(id, engagement_number, title)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (opts?.status) query = query.eq("status", opts.status as never);
  if (opts?.definitionId) query = query.eq("workflow_definition_id", opts.definitionId);
  const { data } = await query;
  return data ?? [];
}

export async function getWorkflowRunDetail(id: string) {
  const supabase = await createClient();
  const [{ data: run }, { data: steps }, { data: events }, { data: approvals }, { data: waits }, { data: jobs }] = await Promise.all([
    supabase
      .from("workflow_runs")
      .select("*, definition:workflow_definitions(id, name), client:clients(id, first_name, last_name, company), engagement:tax_engagements(id, engagement_number, title)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("workflow_run_steps").select("*, node:workflow_nodes(label, node_type)").eq("workflow_run_id", id).order("created_at"),
    supabase.from("workflow_events").select("*").eq("workflow_run_id", id).order("created_at"),
    supabase.from("workflow_approvals").select("*").eq("workflow_run_id", id).order("requested_at", { ascending: false }),
    supabase.from("workflow_waits").select("*").eq("workflow_run_id", id).order("created_at", { ascending: false }),
    supabase.from("workflow_action_outbox").select("*").eq("workflow_run_id", id).order("created_at", { ascending: false }),
  ]);
  return { run, steps: steps ?? [], events: events ?? [], approvals: approvals ?? [], waits: waits ?? [], jobs: jobs ?? [] };
}

export async function getMyApprovals(workspaceId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workflow_approvals")
    .select("*, run:workflow_runs(id, definition:workflow_definitions(id, name))")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .eq("requested_from_user_id", userId)
    .order("requested_at", { ascending: false });
  return data ?? [];
}
