import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPortalContext } from "@/lib/auth/portal";
import { getDocumentRequestDetail } from "@/features/document-requests/queries";
import { PortalDocumentRequestPanel } from "@/features/portal/document-request-panel";

export default async function PortalDocumentRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  const { request, items, documents } = await getDocumentRequestDetail(id);
  if (!request || request.client_id !== context.client.id) notFound();

  return (
    <div className="space-y-4">
      <Link href="/portal/document-requests" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to document requests
      </Link>
      <PortalDocumentRequestPanel
        workspaceId={context.client.workspace_id}
        clientId={context.client.id}
        request={{ id: request.id, title: request.title, status: request.status, due_date: request.due_date, client_message: request.client_message }}
        items={items.map((i) => ({
          id: i.id,
          status: i.status,
          document_label: i.document_label,
          custom_label: i.custom_label,
          description: i.description,
          category_id: i.category_id,
          tax_year: i.tax_year,
          category: i.category,
        }))}
        documents={documents}
      />
    </div>
  );
}
