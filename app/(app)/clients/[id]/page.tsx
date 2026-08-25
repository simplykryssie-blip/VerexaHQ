import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { loadActionPermissions } from "@/lib/actionPermissions";
import { buildOrganizerResponseDetail, hasOrganizerAnswers } from "@/lib/organizer/buildResponseDetail";
import { getWorkspaceStaff } from "@/lib/workspaceStaff";
import { ClientWorkspace } from "./ClientWorkspace";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: client } = await supabase
    .from("clients")
    .select(
      `*,
      relationship_manager:user_profiles!clients_relationship_manager_id_fkey(id, display_name),
      default_reviewer:user_profiles!clients_default_reviewer_id_fkey(id, display_name),
      default_compliance_officer:user_profiles!clients_default_compliance_officer_id_fkey(id, display_name)`
    )
    .eq("id", params.id)
    .single();
  if (!client) notFound();

  const [
    { data: contacts },
    { data: addresses },
    { data: emails },
    { data: phones },
    { data: relationships },
    { data: portalUsers },
    { data: engagements },
    { data: notes },
    { data: documents },
    { data: quotes },
    { data: invoices },
    { data: payments },
    { data: ledgerEntries },
    { data: messageThreads },
    { data: clientActivity },
    { data: documentFolders },
    staffMembers,
    { data: appointments },
  ] = await Promise.all([
    supabase.from("client_contacts").select("*").eq("client_id", client.id).order("display_order"),
    supabase.from("client_addresses").select("*").eq("client_id", client.id).order("display_order"),
    supabase.from("client_emails").select("*").eq("client_id", client.id).order("display_order"),
    supabase.from("client_phones").select("*").eq("client_id", client.id).order("display_order"),
    supabase.from("client_relationships").select("*").eq("client_id", client.id).order("display_order"),
    supabase.from("client_portal_users").select("*").eq("client_id", client.id).order("display_order"),
    supabase
      .from("engagements")
      .select(
        `id, engagement_number, status, review_status, priority, due_date, open_date, completed_date, current_stage,
        services(name),
        engagement_tax_details!engagement_tax_details_engagement_id_fkey(tax_year),
        assigned_staff:user_profiles!engagements_assigned_staff_id_fkey(id, display_name),
        reviewer:user_profiles!engagements_reviewer_id_fkey(id, display_name),
        compliance_officer:user_profiles!engagements_compliance_officer_id_fkey(id, display_name)`
      )
      .eq("client_id", client.id)
      .order("open_date", { ascending: false }),
    supabase
      .from("notes")
      .select("id, subject, body, is_pinned, is_internal, is_private, created_at")
      .eq("entity_type", "client")
      .eq("entity_id", client.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("attachments")
      .select(
        `id, file_name, storage_path, category, tags, version, mime_type, file_size_bytes, folder_id,
        is_favorite, is_archived, is_locked, visibility, created_at, uploaded_by`
      )
      .eq("entity_type", "client")
      .eq("entity_id", client.id)
      .order("created_at", { ascending: false }),
    supabase.from("quotes").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
    supabase.from("invoices").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
    supabase.from("payments").select("*").eq("client_id", client.id).order("payment_date", { ascending: false }),
    supabase
      .from("client_ledger")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("message_threads")
      .select("*")
      .eq("entity_type", "client")
      .eq("entity_id", client.id)
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("activity_log")
      .select("id, description, activity_type, created_at")
      .eq("entity_type", "client")
      .eq("entity_id", client.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("document_folders")
      .select("id, name, parent_folder_id, display_order")
      .eq("entity_type", "client")
      .eq("entity_id", client.id)
      .order("display_order"),
    getWorkspaceStaff(supabase, workspace.id),
    supabase
      .from("appointments")
      .select("id, title, start_at, location")
      .eq("client_id", client.id)
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(5),
  ]);

  const { data: workspaceTags } = await supabase.rpc("get_workspace_tags", { p_workspace_id: workspace.id });

  // No single pipeline is designated "the" lead pipeline anymore -- a lead
  // can have more than one simultaneous active run (e.g. Tax + Bookkeeping
  // at once), each in its own pipeline, so every active run is surfaced
  // rather than assuming there's only ever one.
  const { data: activeLeadRuns } = await supabase
    .from("pipeline_runs")
    .select("id, process_id, processes(name), pipeline_stages!pipeline_runs_current_stage_fkey(stage_name)")
    .eq("entity_type", "client")
    .eq("entity_id", client.id)
    .eq("status", "Active");
  const leadPipelines = (activeLeadRuns ?? []).map((run) => ({
    processId: run.process_id,
    processName: (run.processes as unknown as { name?: string } | null)?.name ?? null,
    stageName: (run.pipeline_stages as unknown as { stage_name?: string } | null)?.stage_name ?? null,
  }));

  // Staff need to see not just that an automation touched this lead/client
  // but where it currently stands -- which automation, which step, and
  // whether it's stuck. Only the single most recent run is surfaced here
  // (older runs are visible in the automation's own run history).
  const { data: latestAutomationRun } = await supabase
    .from("automation_runs")
    .select("id, status, started_at, automations(name), automation_steps!automation_runs_current_step_id_fkey(action_type)")
    .eq("client_id", client.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let automationRunError: string | null = null;
  if (latestAutomationRun?.status === "failed") {
    const { data: latestLog } = await supabase
      .from("automation_execution_logs")
      .select("error_message")
      .eq("execution_data->>run_id", latestAutomationRun.id)
      .not("error_message", "is", null)
      .order("executed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    automationRunError = latestLog?.error_message ?? null;
  }
  const automationStatus = latestAutomationRun
    ? {
        automationName: (latestAutomationRun.automations as unknown as { name?: string } | null)?.name ?? "Automation",
        status: latestAutomationRun.status,
        stepActionType: (latestAutomationRun.automation_steps as unknown as { action_type?: string } | null)?.action_type ?? null,
        error: automationRunError,
      }
    : null;

  const ownerStaff = staffMembers.find((m) => m.is_owner) ?? null;
  const accountHolder = ownerStaff ? { id: ownerStaff.user_id, display_name: ownerStaff.display_name } : null;

  // Relationship manager/Reviewer/Compliance officer default to whatever an
  // ERO/Service Bureau presets in Settings > Firm Profile, falling back to
  // the account holder if nothing's been set. Reviewer/Compliance officer
  // additionally fall back to the parent firm's preset when this workspace
  // is itself a connected downline (ero_ptin/service_bureau_ptin/
  // service_bureau_ero) -- an ERO/SB presetting oversight roles is meant to
  // apply across their whole network, not just their own direct clients.
  // Relationship manager is deliberately excluded from that cross-workspace
  // fallback: it's who owns the day-to-day relationship, which only makes
  // sense as someone local to the client's own firm.
  const { data: ownWorkspaceDefaults } = await supabase
    .from("workspaces")
    .select(
      `default_relationship_manager:user_profiles!workspaces_default_relationship_manager_id_fkey(id, display_name),
      default_reviewer:user_profiles!workspaces_default_reviewer_id_fkey(id, display_name),
      default_compliance_officer:user_profiles!workspaces_default_compliance_officer_id_fkey(id, display_name)`
    )
    .eq("id", workspace.id)
    .single();

  const { data: parentConnection } = await supabase
    .from("firm_connections")
    .select("parent_workspace_id")
    .eq("child_workspace_id", workspace.id)
    .eq("status", "active")
    .in("relationship_type", ["ero_ptin", "service_bureau_ptin", "service_bureau_ero"])
    .maybeSingle();

  const { data: parentWorkspaceDefaults } = parentConnection
    ? await supabase
        .from("workspaces")
        .select(
          `default_reviewer:user_profiles!workspaces_default_reviewer_id_fkey(id, display_name),
          default_compliance_officer:user_profiles!workspaces_default_compliance_officer_id_fkey(id, display_name)`
        )
        .eq("id", parentConnection.parent_workspace_id)
        .maybeSingle()
    : { data: null };

  const rmDefault = (ownWorkspaceDefaults as any)?.default_relationship_manager ?? accountHolder;
  const reviewerDefault =
    (ownWorkspaceDefaults as any)?.default_reviewer ?? (parentWorkspaceDefaults as any)?.default_reviewer ?? accountHolder;
  const complianceDefault =
    (ownWorkspaceDefaults as any)?.default_compliance_officer ?? (parentWorkspaceDefaults as any)?.default_compliance_officer ?? accountHolder;

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  const { data: paymentPlanRows } =
    invoiceIds.length > 0
      ? await supabase
          .from("payment_plans")
          .select("id, invoice_id, installment_number, amount, due_date, status")
          .in("invoice_id", invoiceIds)
      : { data: [] as { id: string; invoice_id: string; installment_number: number; amount: number; due_date: string; status: string }[] };

  const paymentPlansByInvoice: Record<string, { id: string; installment_number: number; amount: number; due_date: string; status: string }[]> = {};
  for (const p of paymentPlanRows ?? []) {
    (paymentPlansByInvoice[p.invoice_id] ??= []).push(p);
  }

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
    .select(
      "id, status, submitted_at, organizer_template_id, filed_as_attachment, engagement_id, resolved_service_id, needs_service_review, review_status, review_note, organizer_templates(name), services(name)"
    )
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  const { data: workspaceServices } = await supabase
    .from("services")
    .select("id, name")
    .eq("workspace_id", workspace.id)
    .eq("status", "published")
    .order("name");

  const pendingOrganizerTemplateIds = Array.from(
    new Set(
      (organizerResponses ?? [])
        .filter((r) => r.status === "not_started" || r.status === "in_progress")
        .map((r) => r.organizer_template_id)
    )
  );

  const submittedOrganizerResponses = (organizerResponses ?? []).filter((r) => hasOrganizerAnswers(r.status));
  const submittedOrganizerResponseIds = submittedOrganizerResponses.map((r) => r.id);
  const submittedOrganizerTemplateIds = Array.from(new Set(submittedOrganizerResponses.map((r) => r.organizer_template_id)));

  const [{ data: organizerAnswerRows }, { data: organizerFieldRows }] = await Promise.all([
    submittedOrganizerResponseIds.length > 0
      ? supabase
          .from("organizer_response_answers")
          .select("id, organizer_response_id, organizer_field_id, value, instance_index")
          .in("organizer_response_id", submittedOrganizerResponseIds)
      : Promise.resolve({ data: [] as { id: string; organizer_response_id: string; organizer_field_id: string; value: unknown; instance_index: number }[] }),
    submittedOrganizerTemplateIds.length > 0
      ? supabase
          .from("organizer_fields")
          .select("id, organizer_template_id, label, field_type, parent_field_id, display_order")
          .in("organizer_template_id", submittedOrganizerTemplateIds)
      : Promise.resolve({ data: [] as { id: string; organizer_template_id: string; label: string; field_type: string; parent_field_id: string | null; display_order: number }[] }),
  ]);

  const organizerResponsesWithDetail = (organizerResponses ?? []).map((r) => {
    if (!hasOrganizerAnswers(r.status)) return { ...r, topLevel: undefined, repeaters: undefined };
    const { topLevel, repeaters } = buildOrganizerResponseDetail(r.id, r.organizer_template_id, organizerAnswerRows ?? [], organizerFieldRows ?? []);
    return { ...r, topLevel, repeaters };
  });

  const { data: engagementLetterTemplates } = await supabase
    .from("engagement_letter_templates")
    .select("id, name, body_html, banner_image_url")
    .eq("workspace_id", workspace.id)
    .eq("status", "published")
    .order("name");

  const { data: documentRequestRows } = await supabase
    .from("document_requests")
    .select(
      `id, title, due_date, status, created_at,
      items:document_request_item_statuses(id, name, is_required, status)`
    )
    .eq("entity_type", "client")
    .eq("entity_id", client.id)
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

  const staffById = new Map(staffMembers.map((m) => [m.user_id, { id: m.user_id, display_name: m.display_name }]));
  const staffOptions = Array.from(staffById.values());

  const documentsWithUploader = (documents ?? []).map((d: any) => ({
    ...d,
    uploaded_by: d.uploaded_by ? staffById.get(d.uploaded_by) ?? null : null,
  }));

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

  const engagementIds = (engagements ?? []).map((e) => e.id);

  const [{ data: engagementActivity }, { data: threadMessages }] = await Promise.all([
    engagementIds.length > 0
      ? supabase
          .from("activity_log")
          .select("id, description, activity_type, created_at")
          .eq("entity_type", "engagement")
          .in("entity_id", engagementIds)
          .order("created_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] as { id: string; description: string; activity_type: string; created_at: string }[] }),
    messageThreads && messageThreads.length > 0
      ? supabase
          .from("messages")
          .select("*")
          .in("thread_id", messageThreads.map((t) => t.id))
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; thread_id: string; sender_type: string; body: string; is_internal: boolean; created_at: string; sender_id: string | null; workspace_id: string }[] }),
  ]);

  let tasks: { id: string; title: string; status: string; due_date: string | null; engagement_id: string | null }[] = [];
  {
    const engagementFilter = engagementIds.length > 0 ? `engagement_id.in.(${engagementIds.join(",")})` : "";
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("id, title, status, due_date, engagement_id")
      .or([engagementFilter, `client_id.eq.${client.id}`].filter(Boolean).join(","))
      .neq("status", "completed")
      .order("due_date");
    tasks = taskRows ?? [];
  }

  // Best-effort "missing documents" estimate: requested items come from each
  // engagement's service document-request template; there's no FK tying a
  // specific attachment to a specific requested item, so this is a count
  // comparison, not an exact per-item match.
  let requestedDocumentCount = 0;
  const serviceIds = Array.from(
    new Set(
      (engagements ?? [])
        .map((e) => (e as unknown as { service_id?: string }).service_id)
        .filter((v): v is string => Boolean(v))
    )
  );
  if (serviceIds.length > 0) {
    const { data: services } = await supabase
      .from("services")
      .select("id, document_request_template_id")
      .in("id", serviceIds)
      .not("document_request_template_id", "is", null);
    const templateIds = (services ?? []).map((s) => s.document_request_template_id).filter((v): v is string => Boolean(v));
    if (templateIds.length > 0) {
      const { count } = await supabase
        .from("document_request_items")
        .select("id", { count: "exact", head: true })
        .in("document_request_template_id", templateIds);
      requestedDocumentCount = count ?? 0;
    }
  }

  const timeline = [...(clientActivity ?? []), ...(engagementActivity ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const outstandingBalance = ledgerEntries && ledgerEntries.length > 0 ? ledgerEntries[0].balance_after : 0;
  const permissions = await loadActionPermissions(supabase, workspace.id);

  const { data: latestInterest } = await supabase
    .from("client_service_interests")
    .select("service_categories(name), services(name)")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: allInterests } = await supabase.from("client_service_interests").select("service_id").eq("client_id", client.id);
  // pending_portal_invites tracks whether the *email* actually went out --
  // client_portal_users.status only tracks the account's own lifecycle
  // (invited/active) and gets set to "invited" the instant the account row
  // is created, before any send is even attempted. Fetched separately so
  // PortalInviteStatus can show real delivery state instead of conflating
  // the two.
  const { data: pendingPortalInvites } = await supabase
    .from("pending_portal_invites")
    .select("client_portal_user_id, status, error, created_at")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });
  const interestedServiceIds = [...new Set((allInterests ?? []).map((i) => i.service_id).filter((id): id is string => Boolean(id)))];
  const requestedService = latestInterest
    ? [
        (latestInterest.service_categories as unknown as { name?: string } | null)?.name,
        (latestInterest.services as unknown as { name?: string } | null)?.name,
      ]
        .filter(Boolean)
        .join(" -- ") || null
    : null;

  return (
    <ClientWorkspace
      workspace={workspace}
      permissions={permissions}
      client={client}
      contacts={contacts ?? []}
      addresses={addresses ?? []}
      emails={emails ?? []}
      phones={phones ?? []}
      workspaceTags={workspaceTags ?? []}
      relationships={relationships ?? []}
      portalUsers={portalUsers ?? []}
      pendingPortalInvites={pendingPortalInvites ?? []}
      engagements={engagements ?? []}
      notes={notes ?? []}
      documents={documentsWithUploader}
      documentFolders={documentFolders ?? []}
      documentRequests={documentRequests}
      signatureRequests={signatureRequests}
      quotes={(quotes ?? []) as never}
      invoices={(invoices ?? []) as never}
      payments={payments ?? []}
      ledgerEntries={ledgerEntries ?? []}
      outstandingBalance={outstandingBalance}
      messageThreads={messageThreads ?? []}
      messages={threadMessages ?? []}
      timeline={timeline}
      tasks={tasks}
      requestedDocumentCount={requestedDocumentCount}
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
        engagement_id: o.engagement_id,
        resolved_service_id: o.resolved_service_id,
        needs_service_review: o.needs_service_review,
        resolved_service_name: o.services?.name ?? null,
        review_status: o.review_status,
        review_note: o.review_note,
      }))}
      workspaceServices={workspaceServices ?? []}
      documentRequestTemplates={documentRequestTemplates ?? []}
      engagementLetterTemplates={engagementLetterTemplates ?? []}
      paymentPlansByInvoice={paymentPlansByInvoice}
      appointments={appointments ?? []}
      staffOptions={staffOptions}
      accountHolder={accountHolder}
      rmDefault={rmDefault}
      reviewerDefault={reviewerDefault}
      complianceDefault={complianceDefault}
      requestedService={requestedService}
      interestedServiceIds={interestedServiceIds}
      leadPipelines={leadPipelines}
      automationStatus={automationStatus}
    />
  );
}
