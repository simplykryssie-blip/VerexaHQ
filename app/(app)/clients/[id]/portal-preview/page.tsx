import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { ClientPortalPreview } from "@/components/portal-preview/ClientPortalPreview";

export const dynamic = "force-dynamic";

function clientDisplayName(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null }) {
  return c.client_type === "business" ? c.business_name ?? "Business" : [c.first_name, c.last_name].filter(Boolean).join(" ") || "Client";
}

// Read-only staff view of what this client sees in their own Client Portal.
// Queries mirror the app/portal/(portal)/* pages, but re-run under the
// staff member's own session -- so every query re-applies the same
// visibility filters the portal session gets from RLS (client_visible
// attachments, portal_visible appointments, non-internal messages) by hand,
// since staff pass RLS via has_permission() regardless of those flags.
export default async function ClientPortalPreviewPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, client_type, primary_email, first_name, last_name, business_name")
    .eq("id", params.id)
    .single();
  if (!client) notFound();

  const [{ data: engagements }, { data: folders }, { data: attachments }, { data: documentRequests }, { data: signatureRequestRows }] =
    await Promise.all([
      supabase
        .from("engagements")
        .select("id, engagement_number, status, due_date, services(name)")
        .eq("client_id", client.id)
        .order("open_date", { ascending: false }),
      supabase.from("document_folders").select("id, name, parent_folder_id, display_order").eq("entity_type", "client").eq("entity_id", client.id).order("display_order"),
      supabase
        .from("attachments")
        .select("id, file_name, folder_id, created_at")
        .eq("entity_type", "client")
        .eq("entity_id", client.id)
        .eq("visibility", "client_visible")
        .eq("is_archived", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("document_requests")
        .select("id, title, due_date, status, items:document_request_item_statuses(id, name, is_required, status)")
        .eq("entity_type", "client")
        .eq("entity_id", client.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("signature_requests")
        .select("id, title, status, due_date, attachment:attachments!signature_requests_attachment_id_fkey(file_name, entity_type, entity_id)")
        .order("created_at", { ascending: false }),
    ]);

  const signatureRequests = (signatureRequestRows ?? []).filter((r) => {
    const a = r.attachment as unknown as { entity_type?: string; entity_id?: string } | null;
    return a?.entity_type === "client" && a.entity_id === client.id;
  });

  const engagementIds = (engagements ?? []).map((e) => e.id);
  const [{ data: clientThreadRows }, { data: engagementThreadRows }] = await Promise.all([
    supabase
      .from("message_threads")
      .select("id, subject, entity_type, entity_id, last_message_at")
      .eq("entity_type", "client")
      .eq("entity_id", client.id),
    engagementIds.length > 0
      ? supabase.from("message_threads").select("id, subject, entity_type, entity_id, last_message_at").eq("entity_type", "engagement").in("entity_id", engagementIds)
      : Promise.resolve({ data: [] as { id: string; subject: string | null; entity_type: string; entity_id: string; last_message_at: string | null }[] }),
  ]);
  const threadRows = [...(clientThreadRows ?? []), ...(engagementThreadRows ?? [])].sort(
    (a, b) => new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
  );

  const threadIds = (threadRows ?? []).map((t) => t.id);
  const { data: messageRows } =
    threadIds.length > 0
      ? await supabase
          .from("messages")
          .select("id, thread_id, sender_type, body, created_at")
          .in("thread_id", threadIds)
          .eq("is_internal", false)
          .order("created_at", { ascending: true })
      : { data: [] as { id: string; thread_id: string; sender_type: string; body: string; created_at: string }[] };

  const [{ data: invoices }, { data: payments }, { data: organizerResponses }, { data: appointments }] = await Promise.all([
    supabase.from("invoices").select("id, invoice_number, total_amount, amount_paid, status, issue_date, due_date").eq("client_id", client.id).order("issue_date", { ascending: false }),
    supabase.from("payments").select("id, amount, payment_date, status").eq("client_id", client.id).order("payment_date", { ascending: false }),
    supabase
      .from("organizer_responses")
      .select("id, status, submitted_at, organizer_templates(name)")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("appointments")
      .select("id, title, start_at, end_at, status, location")
      .eq("client_id", client.id)
      .eq("portal_visible", true)
      .order("start_at", { ascending: false })
      .limit(50),
  ]);

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  const { data: paymentPlanRows } =
    invoiceIds.length > 0
      ? await supabase.from("payment_plans").select("id, invoice_id, installment_number, amount, due_date, status").in("invoice_id", invoiceIds)
      : { data: [] as { id: string; invoice_id: string; installment_number: number; amount: number; due_date: string; status: string }[] };

  return (
    <ClientPortalPreview
      clientName={clientDisplayName(client)}
      engagements={engagements ?? []}
      folders={folders ?? []}
      attachments={attachments ?? []}
      documentRequests={documentRequests ?? []}
      signatureRequests={signatureRequests}
      threads={threadRows ?? []}
      messages={messageRows ?? []}
      invoices={invoices ?? []}
      payments={payments ?? []}
      paymentPlans={paymentPlanRows ?? []}
      organizerResponses={organizerResponses ?? []}
      appointments={appointments ?? []}
    />
  );
}
