import { createClient } from "@/lib/supabase/server";

export async function getDocumentRequests(workspaceId: string, opts?: { status?: string; clientId?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("document_requests")
    .select("*, client:clients(id, first_name, last_name, company), items:document_request_items(id, status)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (opts?.status) query = query.eq("status", opts.status as never);
  if (opts?.clientId) query = query.eq("client_id", opts.clientId);
  const { data } = await query;
  return data ?? [];
}

export async function getDocumentRequestDetail(requestId: string) {
  const supabase = await createClient();
  const [{ data: request }, { data: items }] = await Promise.all([
    supabase
      .from("document_requests")
      .select("*, client:clients(id, first_name, last_name, company), engagement:tax_engagements(id, engagement_number, title)")
      .eq("id", requestId)
      .maybeSingle(),
    supabase.from("document_request_items").select("*, category:document_categories(id, name)").eq("request_id", requestId).order("sort_order"),
  ]);

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: documents } =
    itemIds.length > 0
      ? await supabase.from("documents").select("id, request_item_id, display_name, status").in("request_item_id", itemIds)
      : { data: [] };

  return { request, items: items ?? [], documents: documents ?? [] };
}

export async function getRequestTemplates(workspaceId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("document_request_templates")
    .select("id, title, template_id, template:templates(name, is_system_template, workspace_id)")
    .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
  return data ?? [];
}
