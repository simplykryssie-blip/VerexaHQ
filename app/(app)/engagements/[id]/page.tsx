import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { loadActionPermissions } from "@/lib/actionPermissions";
import { formatAddressValue, formatNameValue } from "@/lib/organizer/formatValue";
import { getWorkspaceStaff } from "@/lib/workspaceStaff";
import { EngagementWorkspace } from "./EngagementWorkspace";

export const dynamic = "force-dynamic";

type OrganizerFieldRow = { id: string; organizer_template_id: string; label: string; field_type: string; parent_field_id: string | null; display_order: number };
type OrganizerAnswerRow = { id: string; organizer_response_id: string; organizer_field_id: string; value: unknown; instance_index: number };

function formatOrganizerValue(fieldType: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "--";
  const str = String(value);
  if (fieldType === "checkbox") return str === "true" ? "Yes" : "No";
  if (fieldType === "yes_no") return str === "yes" ? "Yes" : str === "no" ? "No" : str;
  if (fieldType === "date") {
    const d = new Date(str);
    return isNaN(d.getTime()) ? str : d.toLocaleDateString();
  }
  if (fieldType === "currency") {
    const n = Number(str);
    return isNaN(n) ? str : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (fieldType === "address") {
    return formatAddressValue(value) || "--";
  }
  if (fieldType === "name") {
    return formatNameValue(value) || "--";
  }
  if (fieldType === "file_upload") {
    try {
      const parsed = JSON.parse(str);
      return parsed?.file_name ?? "Uploaded file";
    } catch {
      return "Uploaded file";
    }
  }
  if (fieldType === "signature") {
    try {
      const parsed = JSON.parse(str);
      return parsed?.typed_name ? `Signed by ${parsed.typed_name} on ${new Date(parsed.signed_at).toLocaleDateString()}` : "Signed";
    } catch {
      return "Signed";
    }
  }
  return str;
}

function maskLast4(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return last4 ? `••• •• ${last4}` : "--";
}

function buildFieldAnswer(field: OrganizerFieldRow, answer: OrganizerAnswerRow | undefined) {
  const maskable = (field.field_type === "ssn" || field.field_type === "ein") && answer !== undefined && answer.value !== null;
  return {
    fieldId: field.id,
    answerId: answer?.id ?? null,
    label: field.label,
    fieldType: field.field_type,
    display: maskable ? maskLast4(answer?.value) : formatOrganizerValue(field.field_type, answer?.value),
    maskable,
  };
}

function buildOrganizerResponseDetail(responseId: string, templateId: string, allAnswers: OrganizerAnswerRow[], allFields: OrganizerFieldRow[]) {
  const templateFields = allFields.filter((f) => f.organizer_template_id === templateId);
  const responseAnswers = allAnswers.filter((a) => a.organizer_response_id === responseId);

  const topLevel = templateFields
    .filter(
      (f) => !f.parent_field_id && f.field_type !== "repeating_section" && f.field_type !== "page_break" && f.field_type !== "section" && f.field_type !== "rich_text"
    )
    .sort((a, b) => a.display_order - b.display_order)
    .map((f) => buildFieldAnswer(f, responseAnswers.find((a) => a.organizer_field_id === f.id)));

  const repeaters = templateFields
    .filter((f) => f.field_type === "repeating_section" && !f.parent_field_id)
    .sort((a, b) => a.display_order - b.display_order)
    .map((repeater) => {
      const children = templateFields.filter((f) => f.parent_field_id === repeater.id).sort((a, b) => a.display_order - b.display_order);
      const childIds = new Set(children.map((c) => c.id));
      const childAnswers = responseAnswers.filter((a) => childIds.has(a.organizer_field_id));
      const maxInstance = childAnswers.reduce((max, a) => Math.max(max, a.instance_index ?? 0), -1);
      const instances = [];
      for (let i = 0; i <= maxInstance; i++) {
        instances.push({
          index: i,
          fields: children.map((c) => buildFieldAnswer(c, childAnswers.find((a) => a.organizer_field_id === c.id && a.instance_index === i))),
        });
      }
      return { fieldId: repeater.id, label: repeater.label, instances };
    });

  return { topLevel, repeaters };
}

export default async function EngagementDetailPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: engagement } = await supabase
    .from("engagements")
    .select(
      `id, engagement_number, status, priority, review_status, due_date, open_date, completed_date, current_stage, case_type,
      client_id, service_id,
      clients(id, first_name, last_name, business_name, client_type, relationship_manager_id, default_reviewer_id, default_compliance_officer_id, primary_email, primary_phone),
      services(name),
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
    staffMembers,
    { data: documentFolders },
    { data: canShare },
    { data: activeEroConnection },
  ] = await Promise.all([
    supabase
      .from("pipeline_runs")
      .select("id, status, started_at, completed_at")
      .eq("entity_type", "engagement")
      .eq("entity_id", engagement.id),
    supabase
      .from("tasks")
      .select(
        `id, title, description, status, priority, due_date, completed_at, workflow_stage_id, visibility,
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
    getWorkspaceStaff(supabase, workspace.id),
    supabase
      .from("document_folders")
      .select("id, name, parent_folder_id, display_order")
      .eq("entity_type", "engagement")
      .eq("entity_id", engagement.id)
      .order("display_order"),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "engagements.share" }),
    supabase
      .from("firm_connections")
      .select("id")
      .eq("child_workspace_id", workspace.id)
      .eq("relationship_type", "ero_ptin")
      .eq("status", "active")
      .maybeSingle(),
  ]);

  const workflowRunIds = (workflowRuns ?? []).map((r) => r.id);
  const [{ data: stages }, { data: slaRows }] = await Promise.all([
    workflowRunIds.length > 0
      ? supabase
          .from("pipeline_stages")
          .select(
            `id, stage_name, status, due_date, started_at, completed_at, display_order, process_stage_id,
            reviewer:user_profiles!pipeline_stages_reviewer_id_fkey(id, display_name)`
          )
          .in("pipeline_run_id", workflowRunIds)
          .order("display_order")
      : Promise.resolve({ data: [] as any[] }),
    workflowRunIds.length > 0
      ? supabase.from("v_workflow_sla_status").select("*").in("workflow_run_id", workflowRunIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const slaByStage = new Map((slaRows ?? []).map((s: any) => [s.workflow_stage_id, s.sla_category as string]));

  const stagesWithSla = (stages ?? []).map((s: any) => ({
    ...s,
    sla_category: slaByStage.get(s.id) ?? null,
  }));

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

  const staffOptions = staffMembers.map((m) => ({ id: m.user_id, display_name: m.display_name }));

  const staffById = new Map(staffOptions.map((p) => [p.id, p]));
  const documentsWithUploader = (documents ?? []).map((d: any) => ({
    ...d,
    uploaded_by: d.uploaded_by ? staffById.get(d.uploaded_by) ?? null : null,
  }));

  const { data: documentRequestTemplates } = await supabase
    .from("document_request_templates")
    .select("id, name")
    .eq("workspace_id", workspace.id)
    .eq("status", "published")
    .order("name");

  const { data: organizerTemplates } = await supabase
    .from("organizer_templates")
    .select("id, name")
    .eq("workspace_id", workspace.id)
    .eq("status", "published")
    .order("name");

  const { data: organizerResponses } = await supabase
    .from("organizer_responses")
    .select("id, status, submitted_at, organizer_template_id, filed_as_attachment, organizer_templates(name)")
    .eq("engagement_id", engagement.id)
    .order("created_at", { ascending: false });

  // Scoped to the client, not just this engagement -- an organizer already
  // pending on a different engagement (or sent from the client card) still
  // shows up in the same client portal, so re-sending it here would create
  // a duplicate for the client to see.
  const { data: clientPendingOrganizerResponses } = await supabase
    .from("organizer_responses")
    .select("organizer_template_id")
    .eq("client_id", engagement.client_id)
    .in("status", ["not_started", "in_progress"]);
  const pendingOrganizerTemplateIds = Array.from(
    new Set((clientPendingOrganizerResponses ?? []).map((r) => r.organizer_template_id))
  );

  const { data: engagementLetterTemplates } = await supabase
    .from("engagement_letter_templates")
    .select("id, name, body_html, banner_image_url")
    .eq("workspace_id", workspace.id)
    .eq("status", "published")
    .order("name");

  // Answers are only meaningful once a response is submitted -- fetch and
  // build the read-only detail (top-level fields + repeating-section
  // instances grouped by instance_index) only for those, server-side, so
  // masked ssn/ein values never reach the client bundle: only a precomputed
  // last-4 display string is sent, and the real value is fetched later via
  // reveal_organizer_answer() on demand.
  const submittedResponses = (organizerResponses ?? []).filter((r) => r.status === "submitted" || r.status === "reviewed");
  const submittedResponseIds = submittedResponses.map((r) => r.id);
  const submittedTemplateIds = Array.from(new Set(submittedResponses.map((r) => r.organizer_template_id)));

  const [{ data: organizerAnswerRows }, { data: organizerFieldRows }] = await Promise.all([
    submittedResponseIds.length > 0
      ? supabase
          .from("organizer_response_answers")
          .select("id, organizer_response_id, organizer_field_id, value, instance_index")
          .in("organizer_response_id", submittedResponseIds)
      : Promise.resolve({ data: [] as { id: string; organizer_response_id: string; organizer_field_id: string; value: unknown; instance_index: number }[] }),
    submittedTemplateIds.length > 0
      ? supabase
          .from("organizer_fields")
          .select("id, organizer_template_id, label, field_type, parent_field_id, display_order")
          .in("organizer_template_id", submittedTemplateIds)
      : Promise.resolve({
          data: [] as { id: string; organizer_template_id: string; label: string; field_type: string; parent_field_id: string | null; display_order: number }[],
        }),
  ]);

  const organizerResponsesWithDetail = (organizerResponses ?? []).map((r) => {
    if (r.status !== "submitted" && r.status !== "reviewed") return { ...r, topLevel: undefined, repeaters: undefined };
    const { topLevel, repeaters } = buildOrganizerResponseDetail(r.id, r.organizer_template_id, organizerAnswerRows ?? [], organizerFieldRows ?? []);
    return { ...r, topLevel, repeaters };
  });

  const { data: documentRequestRows } = await supabase
    .from("document_requests")
    .select(
      `id, title, due_date, status, created_at, document_request_template_id,
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
            `id, title, status, due_date, attachment_id, created_at, engagement_letter_template_id,
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
      pendingOrganizerTemplateIds={pendingOrganizerTemplateIds}
      organizerResponses={organizerResponsesWithDetail.map((o: any) => ({
        id: o.id,
        status: o.status,
        submitted_at: o.submitted_at,
        template_name: o.organizer_templates?.name ?? "Organizer",
        filed_as_attachment: o.filed_as_attachment,
        topLevel: o.topLevel,
        repeaters: o.repeaters,
      }))}
      engagementLetterTemplates={engagementLetterTemplates ?? []}
      signatureRequests={signatureRequests}
      notes={notes ?? []}
      messageThreads={messageThreads ?? []}
      messages={(messages ?? []) as never}
      shares={(shares ?? []) as never}
      reviewActions={(reviewActions ?? []) as never}
      canShare={Boolean(canShare) && Boolean(activeEroConnection)}
      assignmentHistory={(assignmentHistory ?? []) as never}
      statusHistory={statusHistory ?? []}
      quotes={(quotes ?? []) as never}
      invoices={(invoices ?? []) as never}
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
