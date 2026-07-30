import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getComplianceCaseDetail } from "@/features/compliance/queries";
import { CompliancePanel } from "@/features/compliance/case-panel";

export default async function ComplianceCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { complianceCase, flags, checklists } = await getComplianceCaseDetail(id);
  if (!complianceCase) notFound();

  const client = complianceCase.client as { first_name?: string; last_name?: string; company?: string } | null;
  const engagement = complianceCase.engagement as { engagement_number?: string; title?: string } | null;

  return (
    <div className="space-y-4">
      <Link href="/compliance" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to compliance
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{complianceCase.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {client?.company || `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim()}
          {engagement && ` · ${engagement.engagement_number ?? engagement.title}`}
        </p>
      </div>
      <CompliancePanel complianceCase={complianceCase} flags={flags} checklists={checklists} />
    </div>
  );
}
