import { createClient } from "@/lib/supabase/server";

export async function getTasks(
  workspaceId: string,
  opts?: { assignedToUserId?: string; clientId?: string; engagementId?: string; leadId?: string; status?: string },
) {
  const supabase = await createClient();
  let query = supabase
    .from("tasks")
    .select("*, client:clients(id, first_name, last_name, company), engagement:tax_engagements(id, engagement_number, title), lead:leads(id, first_name, last_name)")
    .eq("workspace_id", workspaceId)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (opts?.assignedToUserId) query = query.eq("assigned_to_user_id", opts.assignedToUserId);
  if (opts?.clientId) query = query.eq("client_id", opts.clientId);
  if (opts?.engagementId) query = query.eq("engagement_id", opts.engagementId);
  if (opts?.leadId) query = query.eq("lead_id", opts.leadId);
  if (opts?.status) query = query.eq("status", opts.status as never);

  const { data } = await query;
  return data ?? [];
}

export async function getTaskDetail(taskId: string) {
  const supabase = await createClient();
  const [{ data: task }, { data: comments }] = await Promise.all([
    supabase
      .from("tasks")
      .select("*, client:clients(id, first_name, last_name, company), engagement:tax_engagements(id, engagement_number, title), lead:leads(id, first_name, last_name)")
      .eq("id", taskId)
      .maybeSingle(),
    supabase.from("task_comments").select("*").eq("task_id", taskId).order("created_at", { ascending: true }),
  ]);
  return { task, comments: comments ?? [] };
}
