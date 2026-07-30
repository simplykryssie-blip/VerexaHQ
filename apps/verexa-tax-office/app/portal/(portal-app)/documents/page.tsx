import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/auth/portal";
import { getDocuments } from "@/features/documents/queries";
import { PortalDocumentsList, toPortalDocumentRow } from "@/features/portal/documents-list";

export default async function PortalDocumentsPage() {
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  // RLS (can_access_document) further restricts this to documents whose
  // visibility is client-facing — the same query the staff client-detail
  // page uses, filtered here by the caller's own client id.
  const documents = await getDocuments(context.client.workspace_id, { clientId: context.client.id });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">Files your tax office has shared with you.</p>
      </div>
      <PortalDocumentsList documents={documents.map(toPortalDocumentRow)} />
    </div>
  );
}
