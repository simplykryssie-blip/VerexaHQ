import { createClient } from "@/lib/supabase/server";

export async function getTemplates(workspaceId: string, opts?: { kind?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("templates")
    .select("*")
    .or(`workspace_id.eq.${workspaceId},is_system_template.eq.true`)
    .order("updated_at", { ascending: false });
  if (opts?.kind) query = query.eq("kind", opts.kind as never);
  const { data } = await query;
  return data ?? [];
}

export async function getTemplateDetail(id: string) {
  const supabase = await createClient();
  const [{ data: template }, { data: versions }] = await Promise.all([
    supabase.from("templates").select("*").eq("id", id).maybeSingle(),
    supabase.from("template_versions").select("*").eq("template_id", id).order("version_number", { ascending: false }),
  ]);
  return { template, versions: versions ?? [] };
}
