import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { loadActionPermissions } from "@/lib/actionPermissions";
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
    { data: staffMembers },
    { data: appointments },
  ] = await Promise.all([
    supabase.from("client_contacts").select("*").eq("client_id", client.id).order("display_order"),
    supabase.from("client_addresses").select("*").eq("client_id", client.id).order("display_order"),
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
    supabase
      .from("workspace_users")
      .select("user_id, user_profiles(id, display_name)")
      .eq("workspace_id", workspace.id)
      .eq("status", "active"),
    supabase
      .from("appointments")
      .select("id, title, start_at, location")
      .eq("client_id", client.id)
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(5),
  ]);

  const { data: ownerRow } = await supabase
    .from("workspace_users")
    .select("user_id, user_profiles(id, display_name)")
    .eq("workspace_id", workspace.id)
    .eq("is_owner", true)
    .maybeSingle();
  const accountHolder = (ownerRow as any)?.user_profiles ?? null;

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
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  const { data: engagementLetterTemplates } = await supabase
    .from("engagement_letter_templates")
    .select("id, name, body_html")
    .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
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

  const staffById = new Map(
    (staffMembers ?? [])
      .map((m: any) => m.user_profiles)
      .filter((p: any): p is { id: string; display_name: string | null } => Boolean(p))
      .map((p: any) => [p.id, p])
  );
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

  let tasks: { id: string; title: string; status: string; due_date: string | null; engagement_id: string }[] = [];
  if (engagementIds.length > 0) {
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("id, title, status, due_date, engagement_id")
      .in("engagement_id", engagementIds)
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

  return (
    <ClientWorkspace
      workspace={workspace}
      permissions={permissions}
      client={client}
      contacts={contacts ?? []}
      addresses={addresses ?? []}
      relationships={relationships ?? []}
      portalUsers={portalUsers ?? []}
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
      organizerResponses={(organizerResponses ?? []).map((o: any) => ({
        id: o.id,
        status: o.status,
        submitted_at: o.submitted_at,
        template_name: o.organizer_templates?.name ?? "Organizer",
      }))}
      documentRequestTemplates={documentRequestTemplates ?? []}
      engagementLetterTemplates={engagementLetterTemplates ?? []}
      paymentPlansByInvoice={paymentPlansByInvoice}
      appointments={appointments ?? []}
      staffOptions={staffOptions}
      accountHolder={accountHolder}
    />
  );
}
