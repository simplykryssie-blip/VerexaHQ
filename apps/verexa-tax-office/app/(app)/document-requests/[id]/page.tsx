import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDocumentRequestDetail } from "@/features/document-requests/queries";
import { DocumentRequestPanel } from "@/features/document-requests/request-panel";

export default async function DocumentRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { request, items, documents } = await getDocumentRequestDetail(id);
  if (!request) notFound();

  const client = request.client as { first_name?: string; last_name?: string; company?: string } | null;

  return (
    <div className="space-y-4">
      <Link href="/document-requests" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to document requests
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{client?.company || `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim()}</h1>
      </div>
      <DocumentRequestPanel request={request} items={items} documents={documents} />
    </div>
  );
}
