import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { DocumentWorkspace } from "@/components/documents/DocumentWorkspace";

export const dynamic = "force-dynamic";

export default async function PortalDocumentsPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const [{ data: folders }, { data: documents }, { data: requests }, { data: signatureRequestRows }, { data: activity }] = await Promise.all([
    supabase.from("document_folders").select("id, name, parent_folder_id, display_order").eq("entity_type", "client").eq("entity_id", identity.clientId).order("display_order"),
    supabase
      .from("attachments")
      .select("id, file_name, storage_path, category, tags, version, mime_type, file_size_bytes, folder_id, is_favorite, is_archived, is_locked, visibility, created_at, uploaded_by")
      .eq("entity_type", "client")
      .eq("entity_id", identity.clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("document_requests")
      .select("id, title, due_date, status, created_at, items:document_request_item_statuses(id, name, is_required, status)")
      .eq("entity_type", "client")
      .eq("entity_id", identity.clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("signature_requests")
      .select("id, title, status, due_date, attachment_id, created_at, attachment:attachments!signature_requests_attachment_id_fkey(file_name, entity_type, entity_id), signers:signature_request_signers(id, signer_name, signer_email, status, signed_at, access_token)")
      .order("created_at", { ascending: false }),
    supabase.from("activity_log").select("id, description, created_at").eq("entity_type", "client").eq("entity_id", identity.clientId).order("created_at", { ascending: false }).limit(30),
  ]);

  const signatureRequests = (signatureRequestRows ?? [])
    .filter((r) => {
      const a = r.attachment as unknown as { entity_type?: string; entity_id?: string } | null;
      return a?.entity_type === "client" && a.entity_id === identity.clientId;
    })
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

  return (
    <>
      <PageHeader title="My Documents" description="Upload documents we've requested, and review anything we've shared with you." />
      <div className="flex-1 px-8 py-6">
        <DocumentWorkspace
          workspaceId={identity.workspaceId}
          entityType="client"
          entityId={identity.clientId}
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
