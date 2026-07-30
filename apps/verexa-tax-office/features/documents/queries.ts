import { createClient } from "@/lib/supabase/server";

export async function getDocumentCategories() {
  const supabase = await createClient();
  const { data } = await supabase.from("document_categories").select("id, name, applies_to").order("sort_order");
  return data ?? [];
}

export async function getDocuments(
  workspaceId: string,
  opts?: { clientId?: string; engagementId?: string; status?: string; includeArchived?: boolean },
) {
  const supabase = await createClient();
  let query = supabase
    .from("documents")
    .select(
      "*, client:clients(id, first_name, last_name, company), engagement:tax_engagements(id, engagement_number, title), category:document_categories(id, name)",
    )
    .eq("workspace_id", workspaceId)
    .eq("is_latest_version", true)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });

  if (opts?.clientId) query = query.eq("client_id", opts.clientId);
  if (opts?.engagementId) query = query.eq("engagement_id", opts.engagementId);
  if (opts?.status) query = query.eq("status", opts.status as never);
  if (!opts?.includeArchived) query = query.is("archived_at", null);

  const { data } = await query;
  return data ?? [];
}
