import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { loadActionPermissions } from "@/lib/actionPermissions";
import { EngagementWorkspace } from "./EngagementWorkspace";

export const dynamic = "force-dynamic";

export default async function EngagementDetailPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: engagement } = await supabase
    .from("engagements")
    .select(
      `id, engagement_number, status, priority, review_status, due_date, open_date, completed_date, current_stage,
      client_id, service_id,
      clients(id, first_name, last_name, business_name, client_type, relationship_manager_id, default_reviewer_id, default_compliance_officer_id, primary_email, primary_phone),
      engagement_types(name),
      assigned_staff:user_profiles!engagements_assigned_staff_id_fkey(id, display_name),
      reviewer:user_profiles!engagements_reviewer_id_fkey(id, display_name),
      compliance_officer:user_profiles!engagements_compliance_officer_id_fkey(id, display_name)`
    )
    .eq("id", params.id)
    .single();

  if (!engagement) notFound();

  const [
    { data: workflowRuns },
    { data: tasks },
    { data: documents },
    { data: notes },
    { data: messageThreads },
    { data: shares },
    { data: assignmentHistory },
    { data: statusHistory },
    { data: quotes },
    { data: invoices },
    { data: activity },
    { data: progressRows },
    { data: staffMembers },
    { data: documentFolders },
  ] = await Promise.all([
    supabase.from("workflow_runs").select("id, status, started_at, completed_at").eq("engagement_id", engagement.id),
    supabase
      .from("tasks")
      .select(
        `id, title, description, status, priority, due_date, completed_at, workflow_stage_id,
        assigned_staff:user_profiles!tasks_assigned_staff_id_fkey(id, display_name)`
      )
      .eq("engagement_id", engagement.id)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("attachments")
      .select(
        `id, file_name, storage_path, category, tags, version, mime_type, file_size_bytes, folder_id,
        is_favorite, is_archived, is_locked, visibility, created_at, uploaded_by`
      )
      .eq("entity_type", "engagement")
      .eq("entity_id", engagement.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("notes")
      .select("id, subject, body, is_pinned, is_internal, is_private, created_at")
      .eq("entity_type", "engagement")
      .eq("entity_id", engagement.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("message_threads")
      .select("*")
      .eq("entity_type", "engagement")
      .eq("entity_id", engagement.id)
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase.from("engagement_shares").select("*, shared_with:workspaces!case_shares_shared_with_workspace_id_fkey(name)").eq("engagement_id", engagement.id),
    supabase
      .from("engagement_assignment_history")
      .select(
        `id, assignment_role, changed_at, reason,
        previous_user:user_profiles!engagement_assignment_history_previous_user_id_fkey(id, display_name),
        new_user:user_profiles!engagement_assignment_history_new_user_id_fkey(id, display_name)`
      )
      .eq("engagement_id", engagement.id)
      .order("changed_at", { ascending: false }),
    supabase
      .from("engagement_status_history")
      .select("id, old_status, new_status, changed_at, reason")
      .eq("engagement_id", engagement.id)
      .order("changed_at", { ascending: false }),
    supabase.from("quotes").select("*").eq("engagement_id", engagement.id).order("created_at", { ascending: false }),
    supabase.from("invoices").select("*").eq("engagement_id", engagement.id).order("created_at", { ascending: false }),
    supabase
      .from("activity_log")
      .select("id, description, activity_type, created_at")
      .eq("entity_type", "engagement")
      .eq("entity_id", engagement.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("v_engagement_progress").select("*").eq("engagement_id", engagement.id).maybeSingle(),
    supabase
      .from("workspace_users")
      .select("user_id, user_profiles(id, display_name)")
      .eq("workspace_id", workspace.id)
      .eq("status", "active"),
    supabase
      .from("document_folders")
      .select("id, name, parent_folder_id, display_order")
      .eq("entity_type", "engagement")
      .eq("entity_id", engagement.id)
      .order("display_order"),
  ]);

  const workflowRunIds = (workflowRuns ?? []).map((r) => r.id);
  const [{ data: stages }, { data: slaRows }] = await Promise.all([
    workflowRunIds.length > 0
      ? supabase
          .from("workflow_stages")
          .select(
            `id, stage_name, status, due_date, started_at, completed_at, display_order,
            reviewer:user_profiles!workflow_stages_reviewer_id_fkey(id, display_name)`
          )
          .in("workflow_run_id", workflowRunIds)
          .order("display_order")
      : Promise.resolve({ data: [] as any[] }),
    workflowRunIds.length > 0
      ? supabase.from("v_workflow_sla_status").select("*").in("workflow_run_id", workflowRunIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const slaByStage = new Map((slaRows ?? []).map((s: any) => [s.workflow_stage_id, s.sla_category as string]));
  const stagesWithSla = (stages ?? []).map((s: any) => ({ ...s, sla_category: slaByStage.get(s.id) ?? null }));

  const taskIds = (tasks ?? []).map((t) => t.id);
  const { data: dependencies } =
    taskIds.length > 0
      ? await supabase
          .from("task_dependencies")
          .select("id, task_id, depends_on_task_id")
          .in("task_id", taskIds)
      : { data: [] as { id: string; task_id: string; depends_on_task_id: string }[] };

  const taskTitleById = new Map((tasks ?? []).map((t) => [t.id, t.title]));
  const tasksWithDeps = (tasks ?? []).map((t) => ({
    ...t,
    dependencies: (dependencies ?? [])
      .filter((d) => d.task_id === t.id)
      .map((d) => ({ id: d.id, depends_on_task_id: d.depends_on_task_id, depends_on_title: taskTitleById.get(d.depends_on_task_id) ?? "Task" })),
  }));

  const threadIds = (messageThreads ?? []).map((t) => t.id);
  const { data: messages } =
    threadIds.length > 0
      ? await supabase.from("messages").select("*").in("thread_id", threadIds).order("created_at", { ascending: true })
      : { data: [] as any[] };

  const shareIds = (shares ?? []).map((s: any) => s.id);
  const { data: reviewActions } =
    shareIds.length > 0
      ? await supabase
          .from("engagement_review_actions")
          .select("id, engagement_share_id, action, comment, created_at, actor_id")
          .in("engagement_share_id", shareIds)
          .order("created_at", { ascending: false })
      : { data: [] as any[] };

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  const { data: payments } =
    invoiceIds.length > 0
      ? await supabase.from("payments").select("*").in("invoice_id", invoiceIds).order("payment_date", { ascending: false })
      : { data: [] as any[] };

  const staffOptions = (staffMembers ?? [])
    .map((m: any) => m.user_profiles)
    .filter((p: any): p is { id: string; display_name: string | null } => Boolean(p));

  const staffById = new Map(staffOptions.map((p: any) => [p.id, p]));
  const documentsWithUploader = (documents ?? []).map((d: any) => ({
    ...d,
    uploaded_by: d.uploaded_by ? staffById.get(d.uploaded_by) ?? null : null,
  }));

  const { data: documentRequestTemplates } = await supabase
    .from("document_request_templates")
    .select("id, name")
    .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
    .eq("status", "published")
    .order("name");

  const { data: organizerTemplates } = await supabase
    .from("organizer_templates")
    .select("id, name")
    .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
    .eq("status", "published")
    .order("name");

  const { data: organizerResponses } = await supabase
    .from("organizer_responses")
    .select("id, status, submitted_at, organizer_templates(name)")
    .eq("engagement_id", engagement.id)
    .order("created_at", { ascending: false });

  const { data: documentRequestRows } = await supabase
    .from("document_requests")
    .select(
      `id, title, due_date, status, created_at,
      items:document_request_item_statuses(id, name, is_required, status)`
    )
    .eq("entity_type", "engagement")
    .eq("entity_id", engagement.id)
    .order("created_at", { ascending: false });

  const documentIds = (documents ?? []).map((d) => d.id);
  const { data: signatureRequestRows } =
    documentIds.length > 0
      ? await supabase
          .from("signature_requests")
          .select(
            `id, title, status, due_date, attachment_id, created_at,
            attachment:attachments!signature_requests_attachment_id_fkey(file_name),
            signers:signature_request_signers(id, signer_name, signer_email, status, signed_at, access_token)`
          )
          .in("attachment_id", documentIds)
          .order("created_at", { ascending: false })
      : { data: [] as never[] };

  const documentRequests = (documentRequestRows ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    due_date: r.due_date,
    status: r.status,
    created_at: r.created_at,
    items: r.items ?? [],
  }));

  const signatureRequests = (signatureRequestRows ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    due_date: r.due_date,
    attachment_id: r.attachment_id,
    attachment_file_name: r.attachment?.file_name ?? "Document",
    created_at: r.created_at,
    signers: r.signers ?? [],
  }));

  const [{ data: taxDetail }, { data: irsNotices }, { data: taxYears }] = await Promise.all([
    supabase.from("engagement_tax_details").select("*").eq("engagement_id", engagement.id).maybeSingle(),
    supabase
      .from("irs_notices")
      .select("id, notice_type, notice_date, response_due_date, status, description")
      .eq("entity_type", "engagement")
      .eq("entity_id", engagement.id)
      .order("notice_date", { ascending: false }),
    supabase.from("tax_years").select("year").order("year", { ascending: false }),
  ]);
  const permissions = await loadActionPermissions(supabase, workspace.id);

  return (
    <EngagementWorkspace
      workspace={workspace}
      permissions={permissions}
      engagement={engagement as never}
      stages={stagesWithSla as never}
      tasks={tasksWithDeps as never}
      documents={documentsWithUploader}
      documentFolders={documentFolders ?? []}
      documentRequests={documentRequests}
      documentRequestTemplates={documentRequestTemplates ?? []}
      organizerTemplates={organizerTemplates ?? []}
      organizerResponses={(organizerResponses ?? []).map((o: any) => ({
        id: o.id,
        status: o.status,
        submitted_at: o.submitted_at,
        template_name: o.organizer_templates?.name ?? "Organizer",
      }))}
      signatureRequests={signatureRequests}
      notes={notes ?? []}
      messageThreads={messageThreads ?? []}
      messages={(messages ?? []) as never}
      shares={(shares ?? []) as never}
      reviewActions={(reviewActions ?? []) as never}
      assignmentHistory={(assignmentHistory ?? []) as never}
      statusHistory={statusHistory ?? []}
      quotes={quotes ?? []}
      invoices={invoices ?? []}
      payments={(payments ?? []) as never}
      timeline={activity ?? []}
      progress={(progressRows ?? null) as never}
      staffOptions={staffOptions as never}
      taxDetail={(taxDetail ?? null) as never}
      irsNotices={(irsNotices ?? []) as never}
      taxYears={(taxYears ?? []).map((t) => t.year)}
    />
  );
}
