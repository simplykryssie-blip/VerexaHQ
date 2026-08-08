import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { DocumentWorkspace } from "@/components/documents/DocumentWorkspace";

export const dynamic = "force-dynamic";

export default async function PortalEngagementDetailPage({ params }: { params: { id: string } }) {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const { data: engagement } = await supabase
    .from("engagements")
    .select("id, engagement_number, status, due_date, client_id, services(name), engagement_tax_details(tax_year, return_type, is_extended, extension_due_date, efile_status)")
    .eq("id", params.id)
    .eq("client_id", identity.clientId)
    .maybeSingle();
  if (!engagement) notFound();

  const [{ data: folders }, { data: documents }, { data: requests }, { data: signatureRequestRows }, { data: activity }] = await Promise.all([
    supabase.from("document_folders").select("id, name, parent_folder_id, display_order").eq("entity_type", "engagement").eq("entity_id", engagement.id).order("display_order"),
    supabase
      .from("attachments")
      .select("id, file_name, storage_path, category, tags, version, mime_type, file_size_bytes, folder_id, is_favorite, is_archived, is_locked, visibility, created_at, uploaded_by")
      .eq("entity_type", "engagement")
      .eq("entity_id", engagement.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("document_requests")
      .select("id, title, due_date, status, created_at, items:document_request_item_statuses(id, name, is_required, status)")
      .eq("entity_type", "engagement")
      .eq("entity_id", engagement.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("signature_requests")
      .select("id, title, status, due_date, attachment_id, created_at, attachment:attachments!signature_requests_attachment_id_fkey(file_name), signers:signature_request_signers(id, signer_name, signer_email, status, signed_at, access_token)")
      .order("created_at", { ascending: false }),
    supabase.from("activity_log").select("id, description, created_at").eq("entity_type", "engagement").eq("entity_id", engagement.id).order("created_at", { ascending: false }).limit(30),
  ]);

  const documentIds = new Set((documents ?? []).map((d) => d.id));
  const signatureRequests = (signatureRequestRows ?? [])
    .filter((r) => documentIds.has(r.attachment_id))
    .map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status as never,
      due_date: r.due_date,
      attachment_id: r.attachment_id,
      attachment_file_name: (r.attachment as unknown as { file_name?: string } | null)?.file_name ?? "Document",
      created_at: r.created_at,
      signers: (r.signers ?? []) as never,
    }));

  const taxDetail = engagement.engagement_tax_details as unknown as {
    tax_year: number | null;
    return_type: string | null;
    is_extended: boolean;
    extension_due_date: string | null;
    efile_status: string;
  } | null;

  return (
    <>
      <PageHeader
        title={(engagement.services as unknown as { name?: string } | null)?.name ?? "Engagement"}
        description={
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span>{engagement.engagement_number}</span>
            <span className="capitalize">{engagement.status}</span>
            {taxDetail?.tax_year && <span>Tax year {taxDetail.tax_year}</span>}
            {taxDetail?.efile_status && taxDetail.efile_status !== "not_filed" && <span className="capitalize">E-file: {taxDetail.efile_status.replace("_", " ")}</span>}
            {taxDetail?.is_extended && <span>Extended{taxDetail.extension_due_date && ` to ${new Date(taxDetail.extension_due_date).toLocaleDateString()}`}</span>}
            {engagement.due_date && <span>Due {new Date(engagement.due_date).toLocaleDateString()}</span>}
          </div>
        }
      />
      <div className="flex-1 px-8 py-6">
        <DocumentWorkspace
          workspaceId={identity.workspaceId}
          entityType="engagement"
          entityId={engagement.id}
          folders={folders ?? []}
          documents={(documents ?? []) as never}
          requests={(requests ?? []) as never}
          requestTemplates={[]}
          signatureRequests={signatureRequests}
          activity={activity ?? []}
          audience="portal"
        />
      </div>
    </>
  );
}
