import { createClient } from "@/lib/supabase/server";

export async function getComplianceCases(workspaceId: string, opts?: { status?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("compliance_cases")
    .select("*, client:clients(id, first_name, last_name, company), engagement:tax_engagements(id, engagement_number, title)")
    .eq("workspace_id", workspaceId)
    .order("opened_at", { ascending: false });
  if (opts?.status) query = query.eq("status", opts.status as never);
  const { data } = await query;
  return data ?? [];
}

export async function getUnresolvedFlagCount(workspaceId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("compliance_flags")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("is_resolved", false);
  return count ?? 0;
}

export async function getComplianceCaseDetail(caseId: string) {
  const supabase = await createClient();
  const [{ data: complianceCase }, { data: flags }, { data: checklists }] = await Promise.all([
    supabase
      .from("compliance_cases")
      .select("*, client:clients(id, first_name, last_name, company), engagement:tax_engagements(id, engagement_number, title)")
      .eq("id", caseId)
      .maybeSingle(),
    supabase.from("compliance_flags").select("*").eq("compliance_case_id", caseId).order("created_at", { ascending: false }),
    supabase.from("compliance_checklists").select("*, items:compliance_checklist_items(*)").eq("compliance_case_id", caseId),
  ]);
  return { complianceCase, flags: flags ?? [], checklists: checklists ?? [] };
}
