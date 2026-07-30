import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPortalContext } from "@/lib/auth/portal";
import { createClient } from "@/lib/supabase/server";
import { getDocuments } from "@/features/documents/queries";
import { PortalDocumentsList, toPortalDocumentRow } from "@/features/portal/documents-list";
import { formatDate } from "@/lib/formatters";

export default async function PortalCompletedReturnDetailPage({ params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = await params;
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  const supabase = await createClient();
  const [{ data: engagement }, { data: release }] = await Promise.all([
    supabase.from("tax_engagements").select("id, client_id, engagement_number, title, tax_year").eq("id", engagementId).maybeSingle(),
    supabase.from("return_release_controls").select("released_at, release_notes").eq("engagement_id", engagementId).maybeSingle(),
  ]);

  if (!engagement || engagement.client_id !== context.client.id || !release?.released_at) notFound();

  const documents = await getDocuments(context.client.workspace_id, { engagementId });

  return (
    <div className="space-y-4">
      <Link href="/portal/returns" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to completed returns
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{engagement.title || engagement.engagement_number}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {engagement.tax_year ? `Tax year ${engagement.tax_year} · ` : ""}
          Released {formatDate(release.released_at)}
        </p>
        {release.release_notes && <p className="text-sm mt-2">{release.release_notes}</p>}
      </div>
      <PortalDocumentsList documents={documents.map(toPortalDocumentRow)} />
    </div>
  );
}
