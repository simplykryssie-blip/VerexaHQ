import { createClient } from "@/lib/supabase/server";

/** Templates usable for a new organizer assignment: system-wide templates plus
 * this workspace's own published form templates. Mirrors can_access_template's
 * logic (is_system_template OR workspace match) filtered to kind='form' and
 * status='published' since only published versions should ever be assigned. */
export async function getOrganizerTemplates(workspaceId: string) {
  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("templates")
    .select("id, name, description, is_system_template, latest_published_version_id")
    .eq("kind", "form")
    .eq("status", "published")
    .or(`is_system_template.eq.true,workspace_id.eq.${workspaceId}`)
    .not("latest_published_version_id", "is", null)
    .order("is_system_template", { ascending: false })
    .order("name");
  return templates ?? [];
}

export async function getIntakeSubmissionsForWorkspace(workspaceId: string, opts?: { status?: string; clientId?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("intake_submissions")
    .select(
      "id, status, tax_year, progress_percent, due_date, assigned_at, submitted_at, reviewed_at, approved_at, locked_at, client:clients(id, first_name, last_name, company), template:templates(id, name)",
    )
    .eq("workspace_id", workspaceId)
    .order("assigned_at", { ascending: false });

  if (opts?.status) query = query.eq("status", opts.status as never);
  if (opts?.clientId) query = query.eq("client_id", opts.clientId);

  const { data } = await query;
  return data ?? [];
}

export async function getIntakeSubmissionFull(submissionId: string) {
  const supabase = await createClient();

  const { data: submission } = await supabase
    .from("intake_submissions")
    .select(
      "*, client:clients(id, first_name, last_name, company, client_type), template:templates(id, name), template_version:template_versions(id, name, version_number)",
    )
    .eq("id", submissionId)
    .maybeSingle();

  if (!submission) return null;

  const templateVersionId = submission.template_version_id;

  const [
    { data: sections },
    { data: fields },
    { data: conditions },
    { data: calculations },
    { data: answers },
    { data: household },
    { data: entities },
    { data: incomeSources },
    { data: deductions },
    { data: reviewSections },
    { data: comments },
    { data: validationResults },
    { data: revisions },
  ] = await Promise.all([
    supabase.from("form_sections").select("*").eq("template_version_id", templateVersionId).order("sort_order"),
    supabase.from("form_fields").select("*").eq("template_version_id", templateVersionId).order("sort_order"),
    supabase.from("form_conditions").select("*").eq("template_version_id", templateVersionId),
    supabase.from("form_calculations").select("*").eq("template_version_id", templateVersionId),
    supabase.from("intake_answers").select("*").eq("submission_id", submissionId),
    supabase.from("intake_household_people").select("*").eq("submission_id", submissionId).order("sort_order"),
    supabase.from("intake_repeatable_entities").select("*").eq("submission_id", submissionId).order("sort_order"),
    supabase.from("intake_income_sources").select("*").eq("submission_id", submissionId).order("created_at"),
    supabase.from("intake_deductions_credits").select("*").eq("submission_id", submissionId).order("created_at"),
    supabase.from("intake_review_sections").select("*").eq("submission_id", submissionId),
    supabase.from("intake_review_comments").select("*").eq("submission_id", submissionId).order("created_at", { ascending: false }),
    supabase.from("intake_validation_results").select("*").eq("submission_id", submissionId).order("created_at", { ascending: false }),
    supabase.from("intake_submission_revisions").select("*").eq("submission_id", submissionId).order("revision_number", { ascending: false }),
  ]);

  return {
    submission,
    sections: sections ?? [],
    fields: fields ?? [],
    conditions: conditions ?? [],
    calculations: calculations ?? [],
    answers: answers ?? [],
    household: household ?? [],
    entities: entities ?? [],
    incomeSources: incomeSources ?? [],
    deductions: deductions ?? [],
    reviewSections: reviewSections ?? [],
    comments: comments ?? [],
    validationResults: validationResults ?? [],
    revisions: revisions ?? [],
  };
}
