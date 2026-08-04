import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
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
    { data: phones },
    { data: emails },
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
  ] = await Promise.all([
    supabase.from("client_contacts").select("*").eq("client_id", client.id).order("display_order"),
    supabase.from("client_addresses").select("*").eq("client_id", client.id).order("display_order"),
    supabase.from("client_phones").select("*").eq("client_id", client.id).order("display_order"),
    supabase.from("client_emails").select("*").eq("client_id", client.id).order("display_order"),
    supabase.from("client_relationships").select("*").eq("client_id", client.id).order("display_order"),
    supabase.from("client_portal_users").select("*").eq("client_id", client.id).order("display_order"),
    supabase
      .from("engagements")
      .select(
        `id, engagement_number, status, review_status, priority, due_date, open_date, completed_date, current_stage,
        engagement_types(name),
        assigned_staff:user_profiles!engagements_assigned_staff_id_fkey(id, display_name),
        reviewer:user_profiles!engagements_reviewer_id_fkey(id, display_name),
        compliance_officer:user_profiles!engagements_compliance_officer_id_fkey(id, display_name)`
      )
      .eq("client_id", client.id)
      .order("open_date", { ascending: false }),
    supabase
      .from("notes")
      .select("id, body, is_pinned, is_internal, is_private, created_at")
      .eq("entity_type", "client")
      .eq("entity_id", client.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("attachments")
      .select("id, file_name, category, version, mime_type, file_size_bytes, created_at")
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
  ]);

  const { data: documentRequestTemplates } = await supabase
    .from("document_request_templates")
    .select("id, name")
    .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
    .eq("status", "published")
    .order("name");

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
    const { data: workflowRuns } = await supabase
      .from("workflow_runs")
      .select("id, engagement_id")
      .in("engagement_id", engagementIds);
    const runIds = (workflowRuns ?? []).map((r) => r.id);
    if (runIds.length > 0) {
      const { data: stageRows } = await supabase.from("workflow_stages").select("id, workflow_run_id").in("workflow_run_id", runIds);
      const stageIds = (stageRows ?? []).map((s) => s.id);
      if (stageIds.length > 0) {
        const { data: taskRows } = await supabase
          .from("tasks")
          .select("id, title, status, due_date, workflow_stage_id")
          .in("workflow_stage_id", stageIds)
          .neq("status", "completed")
          .order("due_date");
        const stageToRun = new Map((stageRows ?? []).map((s) => [s.id, s.workflow_run_id]));
        const runToEngagement = new Map((workflowRuns ?? []).map((r) => [r.id, r.engagement_id]));
        tasks = (taskRows ?? []).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          due_date: t.due_date,
          engagement_id: runToEngagement.get(stageToRun.get(t.workflow_stage_id) ?? "") ?? "",
        }));
      }
    }
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

  return (
    <ClientWorkspace
      workspace={workspace}
      client={client}
      contacts={contacts ?? []}
      addresses={addresses ?? []}
      phones={phones ?? []}
      emails={emails ?? []}
      relationships={relationships ?? []}
      portalUsers={portalUsers ?? []}
      engagements={engagements ?? []}
      notes={notes ?? []}
      documents={documents ?? []}
      quotes={quotes ?? []}
      invoices={invoices ?? []}
      payments={payments ?? []}
      ledgerEntries={ledgerEntries ?? []}
      outstandingBalance={outstandingBalance}
      messageThreads={messageThreads ?? []}
      messages={threadMessages ?? []}
      timeline={timeline}
      tasks={tasks}
      requestedDocumentCount={requestedDocumentCount}
      documentRequestTemplates={documentRequestTemplates ?? []}
    />
  );
}
